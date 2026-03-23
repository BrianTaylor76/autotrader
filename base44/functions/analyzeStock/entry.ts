import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const ANTHROPIC_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const OPENAI_KEY = Deno.env.get("OPENAI_API_KEY");

function detectSentiment(text) {
  if (!text) return "neutral";
  const lower = text.toLowerCase();
  const bullish = (lower.match(/bullish|buy|upside|growth|strong|positive|opportunity|undervalued|outperform|momentum|breakout/g) || []).length;
  const bearish = (lower.match(/bearish|sell|downside|risk|weak|negative|overvalued|underperform|caution|decline|crash|fall/g) || []).length;
  if (bullish > bearish + 1) return "bullish";
  if (bearish > bullish + 1) return "bearish";
  return "neutral";
}

async function callClaude(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-opus-4-5",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text || "";
}

async function callGPT(prompt) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`GPT error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { symbol, company_name } = await req.json();

    const claudePrompt = `You are an expert stock analyst. Analyze ${symbol} (${company_name}) for a beginner retail investor with a small account under $1000. Cover: (1) what this company does and its current business health, (2) recent price action and what it signals technically, (3) current macroeconomic or world events affecting this stock right now, (4) your honest assessment of whether this is a reasonable stock for a small retail investor to consider right now and why. Be detailed but use plain language. Write 2-3 paragraphs. Do not use bullet points.`;

    const gptPrompt = `You are an expert stock analyst. Analyze ${symbol} (${company_name}) for a beginner retail investor with a small account under $1000. Cover: (1) recent fundamental and technical highlights, (2) how current market conditions and world events are impacting this stock, (3) your honest risk assessment and whether the reward justifies the risk for a small account right now. Be detailed but conversational. Write 2-3 paragraphs. Do not use bullet points.`;

    // Run both AI calls simultaneously
    const [claudeResult, gptResult] = await Promise.allSettled([
      callClaude(claudePrompt),
      callGPT(gptPrompt),
    ]);

    const claudeText = claudeResult.status === "fulfilled" ? claudeResult.value : `Error: ${claudeResult.reason?.message}`;
    const gptText = gptResult.status === "fulfilled" ? gptResult.value : `Error: ${gptResult.reason?.message}`;

    const claudeSentiment = detectSentiment(claudeText);
    const gptSentiment = detectSentiment(gptText);
    const bullishCount = [claudeSentiment, gptSentiment].filter(s => s === "bullish").length;
    const bearishCount = [claudeSentiment, gptSentiment].filter(s => s === "bearish").length;
    const consensus = bullishCount > bearishCount ? "bullish" : bearishCount > bullishCount ? "bearish" : "neutral";

    // Generate comparison summary with Claude Haiku (cheap)
    let agreement_summary = "";
    let disagreement_summary = "";
    if (claudeResult.status === "fulfilled" && gptResult.status === "fulfilled") {
      try {
        const comparisonText = await callClaude(
          `Compare these two stock analyses of ${symbol}:\nAnalyst A: ${claudeText.slice(0, 400)}\nAnalyst B: ${gptText.slice(0, 400)}\nRespond ONLY with JSON: {"agreement":"one sentence where they agree","disagreement":"one sentence where they differ"}`
        );
        const match = comparisonText.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          agreement_summary = parsed.agreement || "";
          disagreement_summary = parsed.disagreement || "";
        }
      } catch (e) {
        // non-critical
      }
    }

    return Response.json({
      claude_analysis: claudeText,
      gpt_analysis: gptText,
      claude_sentiment: claudeSentiment,
      gpt_sentiment: gptSentiment,
      consensus_sentiment: consensus,
      agreement_summary,
      disagreement_summary,
      news: [],
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});