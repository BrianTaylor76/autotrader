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
  const url = `${ALPACA_DATA_URL}/v2/stocks/${symbol}/bars?timeframe=1Min&limit=${limit}&feed=iex`;
  const res = await fetch(url, { headers: alpacaHeaders });
  if (!res.ok) return [];
  const data = await res.json();
  return (data.bars || []).map((b) => b.c);
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

    // Load all signals at once
    const [arkSignals, congressSignals, sentimentSignals] = await Promise.all([
      base44.asServiceRole.entities.ARKSignal.list('-created_date', 500),
      base44.asServiceRole.entities.CongressSignal.list('-created_date', 1000),
      base44.asServiceRole.entities.SentimentSignal.list('-created_date', 200),
    ]);

    const arkSymbolSet = new Set(arkSignals.map(s => s.symbol.toUpperCase()));

    const results = [];

    for (const symbol of watchlist) {
      // 1. MA Signal from live price data
      const prices = await fetchBars(symbol, slow_ma + 10);
      let ma_signal = 'neutral';
      if (prices.length >= slow_ma + 1) {
        const prevPrices = prices.slice(0, -1);
        const currFast = calculateMA(prices, fast_ma);
        const currSlow = calculateMA(prices, slow_ma);
        const prevFast = calculateMA(prevPrices, fast_ma);
        const prevSlow = calculateMA(prevPrices, slow_ma);
        if (currFast && currSlow && prevFast && prevSlow) {
          if (currFast > currSlow) ma_signal = 'bullish';
          else if (currFast < currSlow) ma_signal = 'bearish';
        }
      }

      // 2. ARK Signal — bullish if in ARKK holdings
      const ark_signal = arkSymbolSet.has(symbol.toUpperCase()) ? 'bullish' : 'neutral';

      // 3. Congress Signal — net purchases vs sales in last 30 days
      const symCongress = congressSignals.filter(s => s.symbol.toUpperCase() === symbol.toUpperCase());
      let congress_signal = 'neutral';
      if (symCongress.length > 0) {
        const purchases = symCongress.filter(s => s.transaction?.toLowerCase().includes('purchase')).length;
        const sales = symCongress.filter(s => s.transaction?.toLowerCase().includes('sale')).length;
        if (purchases > sales) congress_signal = 'bullish';
        else if (sales > purchases) congress_signal = 'bearish';
      }

      // 4. Sentiment Signal
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

      // Upsert consensus score
      const existing = await base44.asServiceRole.entities.ConsensusScore.filter({ symbol });
      for (const e of existing) {
        await base44.asServiceRole.entities.ConsensusScore.delete(e.id);
      }

      await base44.asServiceRole.entities.ConsensusScore.create({
        symbol,
        ma_signal,
        ark_signal,
        congress_signal,
        sentiment_signal,
        total_score,
        recommendation,
        scored_at: new Date().toISOString(),
      });

      results.push({ symbol, ma_signal, ark_signal, congress_signal, sentiment_signal, total_score, recommendation });
    }

    return Response.json({ success: true, results, scored_at: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});