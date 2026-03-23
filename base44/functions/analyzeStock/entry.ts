import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';
import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';
import OpenAI from 'npm:openai@4.89.0';

const anthropic = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") });
const openai = new OpenAI({ apiKey: Deno.env.get("OPENAI_API_KEY") });
const FINNHUB_KEY = Deno.env.get("FINNHUB_API_KEY");

function detectSentiment(text) {
  if (!text) return "neutral";
  const lower = text.toLowerCase();
  const bullish = (lower.match(/bullish|buy|upside|growth|strong|positive|opportunity|undervalued|outperform|momentum|breakout/g) || []).length;
  const bearish = (lower.match(/bearish|sell|downside|risk|weak|negative|overvalued|underperform|caution|decline|crash|fall/g) || []).length;
  if (bullish > bearish + 1) return "bullish";
  if (bearish > bullish + 1) return "bearish";
  return "neutral";
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { symbol, company_name } = await req.json();

    // Date ranges for news
    const today = new Date().toISOString().split("T")[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];

    const claudePrompt = `You are an expert stock analyst. Analyze ${symbol} (${company_name}) for a beginner retail investor with a small account under $1000. Cover: (1) what this company does and its current business health, (2) recent price action and what it signals technically, (3) current macroeconomic or world events affecting this stock right now, (4) your honest assessment of whether this is a reasonable stock for a small retail investor to consider right now and why. Be detailed but use plain language. Write 2-3 paragraphs. Do not use bullet points.`;

    const gptPrompt = `You are an expert stock analyst. Analyze ${symbol} (${company_name}) for a beginner retail investor with a small account under $1000. Cover: (1) recent fundamental and technical highlights, (2) how current market conditions and world events are impacting this stock, (3) your honest risk assessment and whether the reward justifies the risk for a small account right now. Be detailed but conversational. Write 2-3 paragraphs. Do not use bullet points.`;

    // Run AI and news in parallel
    const [claudeRes, gptRes, newsRes] = await Promise.all([
      anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1000,
        messages: [{ role: "user", content: claudePrompt }],
      }),
      openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 1000,
        messages: [{ role: "user", content: gptPrompt }],
      }),
      fetch(`https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${thirtyDaysAgo}&to=${today}&token=${FINNHUB_KEY}`)
        .then(r => r.json()).catch(() => []),
    ]);

    const claudeText = claudeRes.content[0]?.text || "";
    const gptText = gptRes.choices[0]?.message?.content || "";

    // Get top 10 news items
    const newsItems = Array.isArray(newsRes) ? newsRes.slice(0, 10) : [];

    // Generate news summaries + comparison in one call
    let summaries = [];
    let agreement = "";
    let disagreement = "";

    if (newsItems.length > 0 || claudeText) {
      const summaryPrompt = newsItems.length > 0
        ? `Summarize each headline in one sentence:\n${newsItems.map((n, i) => `${i + 1}. ${n.headline}`).join("\n")}\n\nAlso, comparing these two analyst opinions:\nAnalyst A: ${claudeText.slice(0, 400)}\nAnalyst B: ${gptText.slice(0, 400)}\nIn one sentence each: Where do they agree? Where do they differ? Format: {"summaries":["..."],"agreement":"...","disagreement":"..."}`
        : `Comparing these two analyst opinions:\nAnalyst A: ${claudeText.slice(0, 400)}\nAnalyst B: ${gptText.slice(0, 400)}\nIn one sentence each: Where do they agree? Where do they differ? Format: {"summaries":[],"agreement":"...","disagreement":"..."}`;

      const summaryRes = await anthropic.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 600,
        messages: [{ role: "user", content: summaryPrompt }],
      });
      const raw = summaryRes.content[0]?.text || "{}";
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        summaries = parsed.summaries || [];
        agreement = parsed.agreement || "";
        disagreement = parsed.disagreement || "";
      }
    }

    const enrichedNews = newsItems.map((n, i) => ({
      headline: n.headline,
      source: n.source,
      url: n.url,
      datetime: n.datetime,
      summary: summaries[i] || "",
    }));

    const claudeSentiment = detectSentiment(claudeText);
    const gptSentiment = detectSentiment(gptText);
    const sentimentVotes = [claudeSentiment, gptSentiment];
    const bullishCount = sentimentVotes.filter(s => s === "bullish").length;
    const bearishCount = sentimentVotes.filter(s => s === "bearish").length;
    const consensus = bullishCount > bearishCount ? "bullish" : bearishCount > bullishCount ? "bearish" : "neutral";

    return Response.json({
      claude_analysis: claudeText,
      gpt_analysis: gptText,
      claude_sentiment: claudeSentiment,
      gpt_sentiment: gptSentiment,
      consensus_sentiment: consensus,
      agreement_summary: agreement,
      disagreement_summary: disagreement,
      news: enrichedNews,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});