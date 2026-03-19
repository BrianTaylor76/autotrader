import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY');
const FINNHUB_KEY = Deno.env.get('FINNHUB_API_KEY');

const SYSTEM_PROMPT = `You are a financial market analyst. Analyze the provided news headlines for a stock/ETF symbol and determine if the current news environment is bullish, bearish, or neutral for short-term trading. Consider market sentiment, macroeconomic signals, company-specific risks, and current events. Be concise and decisive.`;

async function fetchYahooHeadlines(symbol) {
  try {
    const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${symbol}&region=US&lang=en-US`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    if (!res?.ok) return [];
    const xml = await res.text();
    const titles = [];
    const titleRegex = /<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>|<item>[\s\S]*?<title>(.*?)<\/title>/g;
    let match;
    while ((match = titleRegex.exec(xml)) !== null) {
      const title = (match[1] || match[2] || '').trim();
      if (title) titles.push(title);
    }
    return titles.slice(0, 10);
  } catch {
    return [];
  }
}

async function fetchFinnhubHeadlines(symbol) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const url = `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${today}&token=${FINNHUB_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!res?.ok) return [];
    const data = await res.json().catch(() => []);
    return (Array.isArray(data) ? data : []).slice(0, 15).map(item => item.headline || '').filter(Boolean);
  } catch {
    return [];
  }
}

function deduplicateHeadlines(headlines) {
  const seen = new Set();
  const result = [];
  for (const h of headlines) {
    const key = h.toLowerCase().trim();
    if (!seen.has(key) && h.length > 5) {
      seen.add(key);
      result.push(h);
    }
  }
  return result.slice(0, 10);
}

async function callClaude(symbol, headlines) {
  const userPrompt = `Symbol: ${symbol}. Recent headlines: ${JSON.stringify(headlines)}. Return JSON only: { "sentiment": "bullish"|"bearish"|"neutral", "score": 1-10, "reasoning": "one sentence explanation" }`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Claude API error: ${res.status}`);
  const data = await res.json();
  const text = data.content?.[0]?.text || '{}';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  return JSON.parse(jsonMatch ? jsonMatch[0] : text);
}

async function callGPT(symbol, headlines) {
  const userPrompt = `Symbol: ${symbol}. Recent headlines: ${JSON.stringify(headlines)}. Return JSON only: { "sentiment": "bullish"|"bearish"|"neutral", "score": 1-10, "reasoning": "one sentence explanation" }`;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`GPT API error: ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

function determineVerdict(claudeResult, gptResult, sensitivity) {
  const claudeBearishStrong = claudeResult.sentiment === 'bearish' && claudeResult.score <= 4;
  const gptBearishStrong = gptResult.sentiment === 'bearish' && gptResult.score <= 4;
  const claudeBearishMild = claudeResult.sentiment === 'bearish' && claudeResult.score > 4;
  const gptBearishMild = gptResult.sentiment === 'bearish' && gptResult.score > 4;
  const claudeBearishLenient = claudeResult.sentiment === 'bearish' && claudeResult.score <= 3;
  const gptBearishLenient = gptResult.sentiment === 'bearish' && gptResult.score <= 3;

  if (sensitivity === 'strict') {
    // Either AI strongly bearish → block
    if (claudeBearishStrong || gptBearishStrong) return 'block';
    if (claudeBearishMild || gptBearishMild) return 'allow_caution';
    return 'allow';
  } else if (sensitivity === 'balanced') {
    // Both AIs must agree to block
    if (claudeBearishStrong && gptBearishStrong) return 'block';
    if ((claudeBearishStrong || claudeBearishMild) && (gptBearishStrong || gptBearishMild)) return 'allow_caution';
    return 'allow';
  } else {
    // lenient: only block if score <= 3
    if (claudeBearishLenient && gptBearishLenient) return 'block';
    if (claudeBearishStrong || gptBearishStrong) return 'allow_caution';
    return 'allow';
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const settingsList = await base44.asServiceRole.entities.StrategySettings.list('-created_date', 1);
    const settings = settingsList[0];
    const watchlist = settings?.watchlist || [];
    const sensitivity = settings?.veto_sensitivity || 'balanced';

    if (watchlist.length === 0) {
      return Response.json({ message: 'Watchlist is empty', count: 0 });
    }

    const existing = await base44.asServiceRole.entities.AISignal.list('-analyzed_at', 200);
    const existingBySymbol = Object.fromEntries(existing.map(e => [e.symbol.toUpperCase(), e]));

    const results = [];

    for (const symbol of watchlist) {
      try {
        // Fetch headlines from both sources in parallel
        const [yahooHeadlines, finnhubHeadlines] = await Promise.all([
          fetchYahooHeadlines(symbol),
          fetchFinnhubHeadlines(symbol),
        ]);

        const headlines = deduplicateHeadlines([...yahooHeadlines, ...finnhubHeadlines]);

        if (headlines.length === 0) {
          results.push({ symbol, status: 'no_headlines' });
          continue;
        }

        // Call both AIs in parallel
        const [claudeResult, gptResult] = await Promise.all([
          callClaude(symbol, headlines),
          callGPT(symbol, headlines),
        ]);

        const overall_verdict = determineVerdict(claudeResult, gptResult, sensitivity);

        const payload = {
          symbol,
          claude_sentiment: claudeResult.sentiment || 'neutral',
          claude_reasoning: claudeResult.reasoning || '',
          claude_score: claudeResult.score || 5,
          gpt_sentiment: gptResult.sentiment || 'neutral',
          gpt_reasoning: gptResult.reasoning || '',
          gpt_score: gptResult.score || 5,
          overall_verdict,
          headlines_analyzed: headlines,
          analyzed_at: new Date().toISOString(),
        };

        const prev = existingBySymbol[symbol.toUpperCase()];
        if (prev) {
          await base44.asServiceRole.entities.AISignal.update(prev.id, payload);
        } else {
          await base44.asServiceRole.entities.AISignal.create(payload);
        }

        results.push({ symbol, overall_verdict, claude: claudeResult.sentiment, gpt: gptResult.sentiment });
      } catch (e) {
        results.push({ symbol, error: e.message });
      }
    }

    return Response.json({ success: true, count: results.length, results, analyzed_at: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});