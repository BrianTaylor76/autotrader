// api/scoreConsensus.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const ALPACA_KEY = process.env.ALPACA_API_KEY;
const ALPACA_SECRET = process.env.ALPACA_API_SECRET;
const BROAD_ETF_SET = new Set(['SPY', 'QQQ', 'DIA', 'IWM', 'VTI']);

function calcMA(prices, period) {
  if (prices.length < period) return null;
  return prices.slice(-period).reduce((a, b) => a + b, 0) / period;
}

async function fetchDailyBars(symbol, limit) {
  try {
    const res = await fetch(
      `https://data.alpaca.markets/v2/stocks/${symbol}/bars?timeframe=1Day&limit=${limit}&adjustment=raw&feed=iex`,
      { headers: { 'APCA-API-KEY-ID': ALPACA_KEY, 'APCA-API-SECRET-KEY': ALPACA_SECRET }, signal: AbortSignal.timeout(6000) }
    ).catch(() => null);
    if (!res?.ok) return [];
    const data = await res.json().catch(() => ({}));
    return (data.bars || []).map(b => b.c);
  } catch { return []; }
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const { data: settingsList } = await supabase.from('strategy_settings').select('*').order('created_date', { ascending: false }).limit(1);
    const settings = settingsList?.[0];
    const watchlist = settings?.watchlist || [];
    const fast_ma = settings?.fast_ma_period || 5;
    const slow_ma = settings?.slow_ma_period || 13;

    if (watchlist.length === 0) return res.status(200).json({ message: 'Watchlist is empty' });

    const [{ data: arkSignals = [] }, { data: congressSignals = [] }, { data: sentimentSignals = [] }] = await Promise.all([
      supabase.from('ark_signals').select('*'),
      supabase.from('congress_signals').select('*'),
      supabase.from('sentiment_signals').select('*'),
    ]);

    const arkSet = new Set(arkSignals.map(s => s.symbol?.toUpperCase()));
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

    return res.status(200).json({ success: true, results, scored_at: new Date().toISOString() });
  } catch (error) {
    console.error('scoreConsensus error:', error);
    return res.status(500).json({ error: error.message });
  }
}
