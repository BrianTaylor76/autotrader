import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const ALPACA_DATA_URL = 'https://data.alpaca.markets';
const ALPACA_KEY = Deno.env.get('ALPACA_API_KEY');
const ALPACA_SECRET = Deno.env.get('ALPACA_API_SECRET');

const alpacaHeaders = {
  'APCA-API-KEY-ID': ALPACA_KEY,
  'APCA-API-SECRET-KEY': ALPACA_SECRET,
};

function calculateMA(prices, period) {
  if (prices.length < period) return null;
  return prices.slice(-period).reduce((a, b) => a + b, 0) / period;
}

async function fetchBars(symbol, limit) {
  const url = `${ALPACA_DATA_URL}/v2/stocks/${symbol}/bars?timeframe=1Day&limit=${limit}&feed=iex`;
  const res = await fetch(url, { headers: alpacaHeaders, signal: AbortSignal.timeout(8000) }).catch(() => null);
  if (!res?.ok) return [];
  const data = await res.json().catch(() => ({}));
  return (data.bars || []).map((b) => b.c);
}

function scoreSymbol(symbol, prices, fast_ma, slow_ma, arkSymbolSet, congressSignals, sentimentSignals) {
  // MA Signal
  let ma_signal = 'neutral';
  if (prices.length >= slow_ma) {
    const currFast = calculateMA(prices, fast_ma);
    const currSlow = calculateMA(prices, slow_ma);
    if (currFast && currSlow) {
      if (currFast > currSlow) ma_signal = 'bullish';
      else if (currFast < currSlow) ma_signal = 'bearish';
    }
  }

  // ARK Signal
  const ark_signal = arkSymbolSet.has(symbol.toUpperCase()) ? 'bullish' : 'neutral';

  // Congress Signal
  const symCongress = congressSignals.filter(s => s.symbol.toUpperCase() === symbol.toUpperCase());
  let congress_signal = 'neutral';
  if (symCongress.length > 0) {
    const purchases = symCongress.filter(s => s.transaction?.toLowerCase().includes('purchase')).length;
    const sales = symCongress.filter(s => s.transaction?.toLowerCase().includes('sale')).length;
    if (purchases > sales) congress_signal = 'bullish';
    else if (sales > purchases) congress_signal = 'bearish';
  }

  // Sentiment Signal
  const symSentiment = sentimentSignals.find(s => s.symbol.toUpperCase() === symbol.toUpperCase());
  let sentiment_signal = 'neutral';
  if (symSentiment) {
    if (symSentiment.sentiment_score >= 0.6) sentiment_signal = 'bullish';
    else if (symSentiment.sentiment_score <= 0.4) sentiment_signal = 'bearish';
  }

  const signals = [ma_signal, ark_signal, congress_signal, sentiment_signal];
  const total_score = signals.filter(s => s === 'bullish').length;
  const bearCount = signals.filter(s => s === 'bearish').length;

  let recommendation = 'hold';
  if (total_score >= 3) recommendation = 'buy';
  else if (bearCount >= 3) recommendation = 'sell';

  return { symbol, ma_signal, ark_signal, congress_signal, sentiment_signal, total_score, recommendation };
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
    const fast_ma = settings?.fast_ma_period || 9;
    const slow_ma = settings?.slow_ma_period || 21;

    if (watchlist.length === 0) {
      return Response.json({ message: 'Watchlist is empty' });
    }

    // Load all signals + price data in parallel
    const [arkSignals, congressSignals, sentimentSignals, ...priceArrays] = await Promise.all([
      base44.asServiceRole.entities.ARKSignal.list('-created_date', 500),
      base44.asServiceRole.entities.CongressSignal.list('-created_date', 1000),
      base44.asServiceRole.entities.SentimentSignal.list('-created_date', 200),
      ...watchlist.map(sym => fetchBars(sym, slow_ma + 5)),
    ]);

    const arkSymbolSet = new Set(arkSignals.map(s => s.symbol.toUpperCase()));

    // Score all symbols
    const results = watchlist.map((symbol, idx) =>
      scoreSymbol(symbol, priceArrays[idx], fast_ma, slow_ma, arkSymbolSet, congressSignals, sentimentSignals)
    );

    // Upsert: update existing records or create new ones — all in parallel
    const existing = await base44.asServiceRole.entities.ConsensusScore.list('-scored_at', 200);
    const existingBySymbol = Object.fromEntries(existing.map(e => [e.symbol.toUpperCase(), e]));

    await Promise.all(results.map(r => {
      const prev = existingBySymbol[r.symbol.toUpperCase()];
      const payload = { ...r, scored_at: new Date().toISOString() };
      if (prev) {
        return base44.asServiceRole.entities.ConsensusScore.update(prev.id, payload);
      }
      return base44.asServiceRole.entities.ConsensusScore.create(payload);
    }));

    return Response.json({ success: true, results, scored_at: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});