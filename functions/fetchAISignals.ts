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
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`Claude API error ${res.status}: ${errBody}`);
  }
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
  if (!res.ok) {
    const errBody = await res.text().catch(() => '');
    throw new Error(`GPT API error ${res.status}: ${errBody}`);
  }
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

function determineGPTOnlyVerdict(gptResult, sensitivity) {
  const bearishStrong = gptResult.sentiment === 'bearish' && gptResult.score <= 4;
  const bearishMild = gptResult.sentiment === 'bearish' && gptResult.score > 4;
  const bearishLenient = gptResult.sentiment === 'bearish' && gptResult.score <= 3;

  if (sensitivity === 'strict') {
    if (bearishStrong) return 'block';
    if (bearishMild) return 'allow_caution';
    return 'allow';
  } else if (sensitivity === 'balanced') {
    if (bearishStrong) return 'block';
    if (bearishMild) return 'allow_caution';
    return 'allow';
  } else {
    if (bearishLenient) return 'block';
    if (bearishStrong) return 'allow_caution';
    return 'allow';
  }
}

function determineVerdict(claudeResult, gptResult, sensitivity) {
  const claudeBearishStrong = claudeResult.sentiment === 'bearish' && claudeResult.score <= 3;
  const gptBearishStrong = gptResult.sentiment === 'bearish' && gptResult.score <= 3;
  const claudeIsBearish = claudeResult.sentiment === 'bearish';
  const gptIsBearish = gptResult.sentiment === 'bearish';

  // Core rule: BOTH must be bearish with score <= 3 to block
  if (claudeBearishStrong && gptBearishStrong) return 'block';

  // If only one is bearish (other is neutral/bullish) → caution only
  if (claudeIsBearish || gptIsBearish) return 'allow_caution';

  return 'allow';
}

Deno.serve(async (req) => {
  const ran_at = new Date().toISOString();
  let base44;
  const debugInfo = {
    env_check: {
      ANTHROPIC_API_KEY: ANTHROPIC_KEY ? `present (${ANTHROPIC_KEY.length} chars)` : 'MISSING',
      OPENAI_API_KEY: OPENAI_KEY ? `present (${OPENAI_KEY.length} chars)` : 'MISSING',
      FINNHUB_API_KEY: FINNHUB_KEY ? `present (${FINNHUB_KEY.length} chars)` : 'MISSING',
    },
    steps: [],
    symbol_results: [],
  };

  try {
    base44 = createClientFromRequest(req);
    debugInfo.steps.push('SDK initialized');

    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }
    debugInfo.steps.push(`Authenticated as ${user.email} (role: ${user.role})`);

    const settingsList = await base44.asServiceRole.entities.StrategySettings.list('-created_date', 1);
    const settings = settingsList[0];
    const watchlist = settings?.watchlist || [];
    const sensitivity = settings?.veto_sensitivity || 'balanced'; // default balanced
    debugInfo.steps.push(`Watchlist: ${JSON.stringify(watchlist)}, sensitivity: ${sensitivity}`);

    if (watchlist.length === 0) {
      return Response.json({ message: 'Watchlist is empty', count: 0, debug: debugInfo });
    }

    const existing = await base44.asServiceRole.entities.AISignal.list('-analyzed_at', 200);
    const existingBySymbol = Object.fromEntries(existing.map(e => [e.symbol.toUpperCase(), e]));
    debugInfo.steps.push(`Loaded ${existing.length} existing AISignal records`);

    const results = [];

    for (const symbol of watchlist) {
      const symDebug = { symbol, steps: [] };
      try {
        const [yahooHeadlines, finnhubHeadlines] = await Promise.all([
          fetchYahooHeadlines(symbol),
          fetchFinnhubHeadlines(symbol),
        ]);
        symDebug.steps.push(`Yahoo: ${yahooHeadlines.length} headlines, Finnhub: ${finnhubHeadlines.length} headlines`);

        const headlines = deduplicateHeadlines([...yahooHeadlines, ...finnhubHeadlines]);
        symDebug.steps.push(`Deduped headlines: ${headlines.length}`);
        symDebug.headlines = headlines;

        if (headlines.length === 0) {
          symDebug.steps.push('No headlines found, skipping AI calls');
          debugInfo.symbol_results.push(symDebug);
          results.push({ symbol, status: 'no_headlines' });
          continue;
        }

        symDebug.steps.push('Calling Claude and GPT in parallel...');
        const [claudeSettled, gptSettled] = await Promise.allSettled([
          callClaude(symbol, headlines),
          callGPT(symbol, headlines),
        ]);

        const claudeResult = claudeSettled.status === 'fulfilled'
          ? claudeSettled.value
          : { sentiment: 'unavailable', score: null, reasoning: `Claude unavailable: ${claudeSettled.reason?.message || 'unknown error'}` };

        const gptResult = gptSettled.status === 'fulfilled'
          ? gptSettled.value
          : null;

        symDebug.steps.push(`Claude: ${JSON.stringify(claudeResult)}`);
        symDebug.steps.push(`GPT: ${JSON.stringify(gptResult)}`);

        if (!gptResult) {
          throw new Error(`GPT failed: ${gptSettled.reason?.message || 'unknown error'}`);
        }

        // If Claude unavailable, base verdict on GPT alone
        const overall_verdict = claudeResult.sentiment === 'unavailable'
          ? determineGPTOnlyVerdict(gptResult, sensitivity)
          : determineVerdict(claudeResult, gptResult, sensitivity);
        symDebug.steps.push(`Verdict: ${overall_verdict}`);

        const payload = {
          symbol,
          claude_sentiment: claudeResult.sentiment === 'unavailable' ? 'neutral' : (claudeResult.sentiment || 'neutral'),
          claude_reasoning: claudeResult.reasoning || '',
          claude_score: claudeResult.score || null,
          gpt_sentiment: gptResult.sentiment || 'neutral',
          gpt_reasoning: gptResult.reasoning || '',
          gpt_score: gptResult.score || 5,
          overall_verdict,
          headlines_analyzed: headlines,
          analyzed_at: ran_at,
        };

        const prev = existingBySymbol[symbol.toUpperCase()];
        if (prev) {
          await base44.asServiceRole.entities.AISignal.update(prev.id, payload);
          symDebug.steps.push('Updated existing AISignal record');
        } else {
          await base44.asServiceRole.entities.AISignal.create(payload);
          symDebug.steps.push('Created new AISignal record');
        }

        debugInfo.symbol_results.push(symDebug);
        results.push({ symbol, overall_verdict, claude: claudeResult.sentiment, gpt: gptResult.sentiment });
      } catch (e) {
        symDebug.error = e.message;
        symDebug.stack = e.stack;
        debugInfo.symbol_results.push(symDebug);
        results.push({ symbol, error: e.message });

        // Save per-symbol error to DebugLog
        await base44.asServiceRole.entities.DebugLog.create({
          function_name: 'fetchAISignals',
          error_message: `[${symbol}] ${e.message}`,
          stack_trace: e.stack || '',
          context: JSON.stringify(symDebug),
          ran_at,
        }).catch(() => {});
      }
    }

    return Response.json({ success: true, count: results.length, results, debug: debugInfo, analyzed_at: ran_at });
  } catch (error) {
    // Top-level error — save to DebugLog
    if (base44) {
      await base44.asServiceRole.entities.DebugLog.create({
        function_name: 'fetchAISignals',
        error_message: error.message,
        stack_trace: error.stack || '',
        context: JSON.stringify(debugInfo),
        ran_at,
      }).catch(() => {});
    }
    return Response.json({ error: error.message, stack: error.stack, debug: debugInfo }, { status: 500 });
  }
});