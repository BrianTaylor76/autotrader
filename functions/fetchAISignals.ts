import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const ANTHROPIC_KEY = Deno.env.get('ANTHROPIC_API_KEY');
const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY');
const FINNHUB_KEY = Deno.env.get('FINNHUB_API_KEY');

const SYSTEM_PROMPT = `You are a financial market analyst. Analyze the provided news headlines for a stock/ETF symbol and determine if the current news environment is bullish, bearish, or neutral for short-term trading. Consider market sentiment, macroeconomic signals, company-specific risks, and current events. Be concise and decisive.`;

async function fetchYahooHeadlines(symbol) {
  const url = `https://feeds.finance.yahoo.com/rss/2.0/headline?s=${symbol}&region=US&lang=en-US`;
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' },
    signal: AbortSignal.timeout(6000),
  }).catch(() => null);
  if (!res?.ok) return [];
  const text = await res.text().catch(() => '');
  const matches = [...text.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g)];
  return matches.map(m => m[1]).filter(t => t && !t.toLowerCase().includes('yahoo'));
}

async function fetchFinnhubHeadlines(symbol) {
  const today = new Date().toISOString().split('T')[0];
  const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const url = `https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${today}&token=${FINNHUB_KEY}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) }).catch(() => null);
  if (!res?.ok) return [];
  const data = await res.json().catch(() => []);
  return (Array.isArray(data) ? data : []).map(a => a.headline).filter(Boolean);
}

async function askClaude(symbol, headlines) {
  const userMsg = `Symbol: ${symbol}. Recent headlines: ${headlines.join(' | ')}. Return JSON only: { "sentiment": "bullish"|"bearish"|"neutral", "score": 1-10, "reasoning": "one sentence explanation" }`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMsg }],
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Claude error: ${res.status}`);
  const data = await res.json();
  const raw = data.content?.[0]?.text || '{}';
  const json = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || '{}');
  return {
    sentiment: json.sentiment || 'neutral',
    score: Number(json.score) || 5,
    reasoning: json.reasoning || '',
  };
}

async function askGPT(symbol, headlines) {
  const userMsg = `Symbol: ${symbol}. Recent headlines: ${headlines.join(' | ')}. Return JSON only: { "sentiment": "bullish"|"bearish"|"neutral", "score": 1-10, "reasoning": "one sentence explanation" }`;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      max_tokens: 256,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userMsg },
      ],
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`GPT error: ${res.status}`);
  const data = await res.json();
  const raw = data.choices?.[0]?.message?.content || '{}';
  const json = JSON.parse(raw);
  return {
    sentiment: json.sentiment || 'neutral',
    score: Number(json.score) || 5,
    reasoning: json.reasoning || '',
  };
}

function computeVerdict(claude, gpt, sensitivity) {
  // strict: either AI bearish = block
  // balanced: both must agree bearish to block
  // lenient: both must be bearish with score <= 3
  const claudeBearish = claude.sentiment === 'bearish';
  const gptBearish = gpt.sentiment === 'bearish';

  if (sensitivity === 'strict') {
    if (claudeBearish && claude.score <= 4) return 'block';
    if (gptBearish && gpt.score <= 4) return 'block';
    return 'allow';
  } else if (sensitivity === 'lenient') {
    if (claudeBearish && claude.score <= 3 && gptBearish && gpt.score <= 3) return 'block';
    return 'allow';
  } else {
    // balanced (default)
    if (claudeBearish && claude.score <= 4 && gptBearish && gpt.score <= 4) return 'block';
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

    const results = await Promise.all(watchlist.map(async (symbol) => {
      try {
        const [yahooHeadlines, finnhubHeadlines] = await Promise.all([
          fetchYahooHeadlines(symbol),
          fetchFinnhubHeadlines(symbol),
        ]);

        // Combine + deduplicate
        const seen = new Set();
        const combined = [...yahooHeadlines, ...finnhubHeadlines].filter(h => {
          const key = h.toLowerCase().slice(0, 60);
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).slice(0, 10);

        if (combined.length === 0) {
          // No headlines, default to allow
          const payload = {
            symbol, claude_sentiment: 'neutral', claude_reasoning: 'No headlines available', claude_score: 5,
            gpt_sentiment: 'neutral', gpt_reasoning: 'No headlines available', gpt_score: 5,
            overall_verdict: 'allow', headlines_analyzed: [], analyzed_at: new Date().toISOString(),
          };
          const prev = existingBySymbol[symbol.toUpperCase()];
          if (prev) await base44.asServiceRole.entities.AISignal.update(prev.id, payload);
          else await base44.asServiceRole.entities.AISignal.create(payload);
          return { symbol, verdict: 'allow', note: 'no headlines' };
        }

        const [claude, gpt] = await Promise.all([
          askClaude(symbol, combined),
          askGPT(symbol, combined),
        ]);

        const overall_verdict = computeVerdict(claude, gpt, sensitivity);

        const payload = {
          symbol,
          claude_sentiment: claude.sentiment,
          claude_reasoning: claude.reasoning,
          claude_score: claude.score,
          gpt_sentiment: gpt.sentiment,
          gpt_reasoning: gpt.reasoning,
          gpt_score: gpt.score,
          overall_verdict,
          headlines_analyzed: combined,
          analyzed_at: new Date().toISOString(),
        };

        const prev = existingBySymbol[symbol.toUpperCase()];
        if (prev) await base44.asServiceRole.entities.AISignal.update(prev.id, payload);
        else await base44.asServiceRole.entities.AISignal.create(payload);

        return { symbol, verdict: overall_verdict, claude: claude.sentiment, gpt: gpt.sentiment };
      } catch (e) {
        return { symbol, error: e.message };
      }
    }));

    return Response.json({ success: true, results, analyzed_at: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});