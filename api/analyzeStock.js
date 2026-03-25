// api/analyzeStock.js
// AI stock analysis using Claude + GPT-4o

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

function detectSentiment(text) {
  if (!text) return 'neutral';
  const lower = text.toLowerCase();
  const bullish = (lower.match(/bullish|buy|upside|growth|strong|positive|opportunity|undervalued|outperform|momentum|breakout/g) || []).length;
  const bearish = (lower.match(/bearish|sell|downside|risk|weak|negative|overvalued|underperform|caution|decline|crash|fall/g) || []).length;
  if (bullish > bearish + 1) return 'bullish';
  if (bearish > bullish + 1) return 'bearish';
  return 'neutral';
}

async function callClaude(prompt) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Claude error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

async function callGPT(prompt) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`GPT error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { symbol, company_name } = req.body || {};
    if (!symbol) return res.status(400).json({ error: 'symbol required' });

    const claudePrompt = `You are an expert stock analyst. Analyze ${symbol} (${company_name || symbol}) for a beginner retail investor with a small account under $1000. Cover: (1) what this company does and its current business health, (2) recent price action and what it signals technically, (3) current macroeconomic or world events affecting this stock right now, (4) your honest assessment of whether this is a reasonable stock for a small retail investor to consider right now and why. Be detailed but use plain language. Write 2-3 paragraphs. Do not use bullet points.`;

    const gptPrompt = `You are an expert stock analyst. Analyze ${symbol} (${company_name || symbol}) for a beginner retail investor with a small account under $1000. Cover: (1) recent fundamental and technical highlights, (2) how current market conditions and world events are impacting this stock, (3) your honest risk assessment and whether the reward justifies the risk for a small account right now. Be detailed but conversational. Write 2-3 paragraphs. Do not use bullet points.`;

    const [claudeResult, gptResult] = await Promise.allSettled([
      callClaude(claudePrompt),
      callGPT(gptPrompt),
    ]);

    const claudeText = claudeResult.status === 'fulfilled' ? claudeResult.value : `Analysis unavailable: ${claudeResult.reason?.message}`;
    const gptText = gptResult.status === 'fulfilled' ? gptResult.value : `Analysis unavailable: ${gptResult.reason?.message}`;

    const claudeSentiment = detectSentiment(claudeText);
    const gptSentiment = detectSentiment(gptText);
    const bullishCount = [claudeSentiment, gptSentiment].filter(s => s === 'bullish').length;
    const bearishCount = [claudeSentiment, gptSentiment].filter(s => s === 'bearish').length;
    const consensus = bullishCount > bearishCount ? 'bullish' : bearishCount > bullishCount ? 'bearish' : 'neutral';

    let agreement_summary = '';
    let disagreement_summary = '';
    if (claudeResult.status === 'fulfilled' && gptResult.status === 'fulfilled') {
      try {
        const comparisonText = await callClaude(
          `Compare these two stock analyses of ${symbol}:\nAnalyst A: ${claudeText.slice(0, 400)}\nAnalyst B: ${gptText.slice(0, 400)}\nRespond ONLY with JSON: {"agreement":"one sentence where they agree","disagreement":"one sentence where they differ"}`
        );
        const match = comparisonText.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0]);
          agreement_summary = parsed.agreement || '';
          disagreement_summary = parsed.disagreement || '';
        }
      } catch (e) { /* non-critical */ }
    }

    return res.status(200).json({
      claude_analysis: claudeText,
      gpt_analysis: gptText,
      claude_sentiment: claudeSentiment,
      gpt_sentiment: gptSentiment,
      consensus_sentiment: consensus,
      agreement_summary,
      disagreement_summary,
    });
  } catch (error) {
    console.error('analyzeStock error:', error);
    return res.status(500).json({ error: error.message });
  }
}
