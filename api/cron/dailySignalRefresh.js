// api/cron/dailySignalRefresh.js
// Runs once per day at 9:15am ET (13:15 UTC) - fetches all signals
// Replaces the expensive per-run signal fetching from Base44

import { supabase, getSettings, sendPush } from '../../lib/supabase.js';

const FINNHUB_KEY = process.env.FINNHUB_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

// ── ARK SIGNALS ───────────────────────────────────────────────────────────────

const ARK_CSV_URL = 'https://ark-funds.com/wp-content/uploads/funds-etf-csv/ARK_INNOVATION_ETF_ARKK_HOLDINGS.csv';
const ARKK_FALLBACK = ['TSLA','NVDA','ROKU','COIN','SQ','ZOOM','SPOT','CRISPR','TDOC','PATH','EXAS','BEAM','PACB','TWLO','ZM','SHOP','DKNG','RBLX','U','HOOD'];

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
  return lines.slice(1).map(line => {
    const cols = line.split(',').map(c => c.replace(/"/g, '').trim());
    const row = {};
    headers.forEach((h, i) => { row[h] = cols[i] || ''; });
    return row;
  });
}

async function fetchARKSignals() {
  const today = new Date().toISOString().split('T')[0];
  let records = [];
  let source = 'fallback';

  try {
    const res = await fetch(ARK_CSV_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/csv,text/plain,*/*' },
      signal: AbortSignal.timeout(12000),
    });
    if (res.ok) {
      const text = await res.text();
      const rows = parseCSV(text);
      const parsed = rows
        .filter(r => (r.ticker || r.symbol || '').trim().length > 0)
        .map(r => ({
          symbol: (r.ticker || r.symbol || '').trim().toUpperCase(),
          weight: parseFloat(r['weight(%)'] || r.weight || 0),
          date: r.date || today,
        }))
        .filter(r => r.symbol.length > 0 && r.symbol.length <= 10);
      if (parsed.length > 0) { records = parsed; source = 'csv'; }
    }
  } catch (e) { console.error('ARK CSV fetch failed:', e.message); }

  if (records.length === 0) {
    records = ARKK_FALLBACK.map((symbol, i) => ({ symbol, weight: parseFloat(((20 - i) * 0.75).toFixed(2)), date: today }));
  }

  // Upsert all ARK signals
  for (const r of records) {
    await supabase.from('ark_signals').upsert({ symbol: r.symbol, weight: r.weight, date: r.date }, { onConflict: 'symbol' });
  }

  return { count: records.length, source };
}

// ── SENTIMENT SIGNALS ─────────────────────────────────────────────────────────

async function fetchSentimentSignals(watchlist) {
  const today = new Date().toISOString().split('T')[0];
  const results = [];

  await Promise.all(watchlist.map(async symbol => {
    try {
      const url = `https://finnhub.io/api/v1/news-sentiment?symbol=${symbol}&token=${FINNHUB_KEY}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);
      if (!res?.ok) {
        results.push({ symbol, bullish_count: 0, bearish_count: 0, sentiment_score: 0.5, date: today });
        return;
      }
      const data = await res.json().catch(() => ({}));
      const score = typeof data.companyNewsScore === 'number' ? data.companyNewsScore : 0.5;
      const articles = data.buzz?.articlesInLastWeek || 10;
      const bullish = Math.round(articles * score);
      const bearish = Math.round(articles * (1 - score));

      results.push({ symbol, bullish_count: bullish, bearish_count: bearish, sentiment_score: score, date: today });

      // Spike notifications
      if (score >= 0.8) {
        await sendPush({ title: 'AutoTrader: 📊 Sentiment Spike', message: `${symbol} news sentiment is ${Math.round(score * 100)}% bullish — unusual activity detected`, priority: 0, sound: 'bike', trigger_type: 'sentiment_spike', symbol, value: `${Math.round(score * 100)}% bullish` });
      } else if (score <= 0.2) {
        await sendPush({ title: 'AutoTrader: 📊 Sentiment Spike', message: `${symbol} news sentiment is ${Math.round((1 - score) * 100)}% bearish — unusual activity detected`, priority: 0, sound: 'bike', trigger_type: 'sentiment_spike', symbol });
      }
    } catch {
      results.push({ symbol, bullish_count: 0, bearish_count: 0, sentiment_score: 0.5, date: today });
    }
  }));

  for (const r of results) {
    await supabase.from('sentiment_signals').upsert(r, { onConflict: 'symbol' });
  }

  return results;
}

// ── AI SIGNALS ────────────────────────────────────────────────────────────────

const AI_SYSTEM_PROMPT = `You are a financial market analyst. Analyze the provided news headlines for a stock/ETF symbol and determine if the current news environment is bullish, bearish, or neutral for short-term trading. Be concise and decisive.`;

async function fetchYahooHeadlines(symbol) {
  try {
    const res = await fetch(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${symbol}&region=US&lang=en-US`, {
      headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(8000),
    }).catch(() => null);
    if (!res?.ok) return [];
    const xml = await res.text();
    const titles = [];
    const regex = /<item>[\s\S]*?<title><!\[CDATA\[(.*?)\]\]><\/title>|<item>[\s\S]*?<title>(.*?)<\/title>/g;
    let match;
    while ((match = regex.exec(xml)) !== null) {
      const title = (match[1] || match[2] || '').trim();
      if (title) titles.push(title);
    }
    return titles.slice(0, 10);
  } catch { return []; }
}

async function fetchFinnhubHeadlines(symbol) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const res = await fetch(`https://finnhub.io/api/v1/company-news?symbol=${symbol}&from=${from}&to=${today}&token=${FINNHUB_KEY}`, { signal: AbortSignal.timeout(8000) }).catch(() => null);
    if (!res?.ok) return [];
    const data = await res.json().catch(() => []);
    return (Array.isArray(data) ? data : []).slice(0, 15).map(i => i.headline || '').filter(Boolean);
  } catch { return []; }
}

async function callClaude(symbol, headlines) {
  const prompt = `Symbol: ${symbol}. Headlines: ${JSON.stringify(headlines)}. Return JSON only: { "sentiment": "bullish"|"bearish"|"neutral", "score": 1-10, "reasoning": "one sentence" }`;
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': ANTHROPIC_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 200, system: AI_SYSTEM_PROMPT, messages: [{ role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`Claude API error ${res.status}`);
  const data = await res.json();
  const text = data.content?.[0]?.text || '{}';
  const match = text.match(/\{[\s\S]*\}/);
  return JSON.parse(match ? match[0] : text);
}

async function callGPT(symbol, headlines) {
  const prompt = `Symbol: ${symbol}. Headlines: ${JSON.stringify(headlines)}. Return JSON only: { "sentiment": "bullish"|"bearish"|"neutral", "score": 1-10, "reasoning": "one sentence" }`;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${OPENAI_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-4o', max_tokens: 200, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: AI_SYSTEM_PROMPT }, { role: 'user', content: prompt }] }),
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error(`GPT API error ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.choices[0].message.content);
}

async function fetchAISignals(watchlist) {
  const ran_at = new Date().toISOString();
  const results = [];

  for (const symbol of watchlist) {
    try {
      const [yahoo, finnhub] = await Promise.all([fetchYahooHeadlines(symbol), fetchFinnhubHeadlines(symbol)]);
      const seen = new Set();
      const headlines = [...yahoo, ...finnhub].filter(h => { const k = h.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 10);

      if (headlines.length === 0) { results.push({ symbol, status: 'no_headlines' }); continue; }

      const [claudeSettled, gptSettled] = await Promise.allSettled([callClaude(symbol, headlines), callGPT(symbol, headlines)]);
      const claudeResult = claudeSettled.status === 'fulfilled' ? claudeSettled.value : { sentiment: 'unavailable', score: null, reasoning: `Claude unavailable: ${claudeSettled.reason?.message}` };
      const gptResult = gptSettled.status === 'fulfilled' ? gptSettled.value : null;
      if (!gptResult) throw new Error(`GPT failed: ${gptSettled.reason?.message}`);

      const claudeBearish = claudeResult.sentiment === 'bearish' && claudeResult.score <= 3;
      const gptBearish = gptResult.sentiment === 'bearish' && gptResult.score <= 3;
      const overall_verdict = claudeResult.sentiment === 'unavailable'
        ? (gptBearish ? 'block' : 'allow')
        : (claudeBearish && gptBearish ? 'block' : (claudeResult.sentiment === 'bearish' || gptResult.sentiment === 'bearish' ? 'allow_caution' : 'allow'));

      const payload = {
        symbol, claude_sentiment: claudeResult.sentiment === 'unavailable' ? 'neutral' : (claudeResult.sentiment || 'neutral'),
        claude_reasoning: claudeResult.reasoning || '', claude_score: claudeResult.score || null,
        gpt_sentiment: gptResult.sentiment || 'neutral', gpt_reasoning: gptResult.reasoning || '',
        gpt_score: gptResult.score || 5, overall_verdict, headlines_analyzed: headlines, analyzed_at: ran_at,
      };

      await supabase.from('ai_signals').upsert(payload, { onConflict: 'symbol' });
      results.push({ symbol, overall_verdict, claude: claudeResult.sentiment, gpt: gptResult.sentiment });
    } catch (e) {
      await supabase.from('debug_logs').insert({ function_name: 'fetchAISignals', error_message: `[${symbol}] ${e.message}`, ran_at });
      results.push({ symbol, error: e.message });
    }
  }

  return results;
}

// ── SCORE CONSENSUS ───────────────────────────────────────────────────────────

const BROAD_ETF_SET = new Set(['SPY', 'QQQ', 'DIA', 'IWM', 'VTI']);
const ALPACA_KEY = process.env.ALPACA_API_KEY;
const ALPACA_SECRET = process.env.ALPACA_API_SECRET;

function calcMA(prices, period) {
  if (prices.length < period) return null;
  return prices.slice(-period).reduce((a, b) => a + b, 0) / period;
}

async function fetchDailyBars(symbol, limit) {
  try {
    const res = await fetch(`https://data.alpaca.markets/v2/stocks/${symbol}/bars?timeframe=1Day&limit=${limit}&adjustment=raw&feed=iex`, {
      headers: { 'APCA-API-KEY-ID': ALPACA_KEY, 'APCA-API-SECRET-KEY': ALPACA_SECRET },
      signal: AbortSignal.timeout(6000),
    }).catch(() => null);
    if (!res?.ok) return [];
    const data = await res.json().catch(() => ({}));
    return (data.bars || []).map(b => b.c);
  } catch { return []; }
}

async function scoreConsensus(watchlist, fast_ma, slow_ma) {
  const [{ data: arkSignals = [] }, { data: congressSignals = [] }, { data: sentimentSignals = [] }] = await Promise.all([
    supabase.from('ark_signals').select('*'),
    supabase.from('congress_signals').select('*'),
    supabase.from('sentiment_signals').select('*'),
  ]);

  const arkSet = new Set(arkSignals.map(s => s.symbol.toUpperCase()));
  const results = [];

  for (const symbol of watchlist) {
    const prices = await fetchDailyBars(symbol, Math.min(slow_ma + 3, 30));
    const isETF = BROAD_ETF_SET.has(symbol.toUpperCase());

    let ma_signal = 'neutral';
    if (prices.length >= slow_ma) {
      const fast = calcMA(prices, fast_ma);
      const slow = calcMA(prices, slow_ma);
      if (fast && slow) ma_signal = fast > slow ? 'bullish' : fast < slow ? 'bearish' : 'neutral';
    }

    const ark_signal = arkSet.has(symbol.toUpperCase()) ? 'bullish' : 'neutral';
    const symCongress = congressSignals.filter(s => s.symbol?.toUpperCase() === symbol.toUpperCase());
    const purchases = symCongress.filter(s => s.transaction?.toLowerCase().includes('purchase')).length;
    const sales = symCongress.filter(s => s.transaction?.toLowerCase().includes('sale')).length;
    const congress_signal = purchases > sales ? 'bullish' : sales > purchases ? 'bearish' : 'neutral';

    const symSentiment = sentimentSignals.find(s => s.symbol?.toUpperCase() === symbol.toUpperCase());
    const sentiment_signal = symSentiment
      ? (symSentiment.sentiment_score >= 0.6 ? 'bullish' : symSentiment.sentiment_score <= 0.4 ? 'bearish' : 'neutral')
      : 'neutral';

    let total_score, max_score;
    if (isETF) {
      total_score = (ma_signal === 'bullish' ? 2 : 0) + (sentiment_signal === 'bullish' ? 1 : 0);
      max_score = 3;
    } else {
      total_score = [ma_signal, ark_signal, congress_signal, sentiment_signal].filter(s => s === 'bullish').length;
      max_score = 4;
    }

    const recommendation = total_score >= 1 ? 'buy' : 'hold';
    const payload = { symbol, ma_signal, ark_signal, congress_signal, sentiment_signal, total_score, max_score, recommendation, scored_at: new Date().toISOString() };

    await supabase.from('consensus_scores').upsert(payload, { onConflict: 'symbol' });
    results.push({ symbol, total_score, recommendation });
  }

  return results;
}

// ── MAIN HANDLER ──────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  const started_at = new Date().toISOString();
  console.log('Daily signal refresh started:', started_at);

  try {
    const settings = await getSettings();
    const watchlist = settings?.watchlist || [];
    const fast_ma = settings?.fast_ma_period || 5;
    const slow_ma = settings?.slow_ma_period || 13;

    if (watchlist.length === 0) {
      return res.status(200).json({ message: 'Watchlist empty, nothing to refresh.' });
    }

    // Run all signal fetches in parallel (ARK + sentiment)
    // AI signals run separately since they're expensive
    const [arkResult, sentimentResult] = await Promise.all([
      fetchARKSignals(),
      fetchSentimentSignals(watchlist),
    ]);

    // AI signals - run after ARK/sentiment since they cost money
    const aiResult = await fetchAISignals(watchlist);

    // Score consensus using fresh signals
    const consensusResult = await scoreConsensus(watchlist, fast_ma, slow_ma);

    return res.status(200).json({
      success: true,
      started_at,
      completed_at: new Date().toISOString(),
      ark: arkResult,
      sentiment: { count: sentimentResult.length },
      ai: { count: aiResult.length },
      consensus: { count: consensusResult.length },
    });
  } catch (error) {
    console.error('Daily signal refresh error:', error);
    await supabase.from('debug_logs').insert({ function_name: 'dailySignalRefresh', error_message: error.message, ran_at: started_at });
    return res.status(500).json({ error: error.message });
  }
}
