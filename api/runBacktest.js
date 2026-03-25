// api/runBacktest.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const ALPACA_KEY = process.env.ALPACA_API_KEY;
const ALPACA_SECRET = process.env.ALPACA_API_SECRET;
const COVID_START = new Date('2020-02-15');
const COVID_END = new Date('2020-04-30');
const RISK_FREE_RATE = 0.045;

function isCovidPeriod(dateStr) {
  const d = new Date(dateStr);
  return d >= COVID_START && d <= COVID_END;
}

function calcMA(prices, period, idx) {
  if (idx < period - 1) return null;
  let sum = 0;
  for (let i = idx - period + 1; i <= idx; i++) sum += prices[i];
  return sum / period;
}

async function fetchAllBars(symbol, startDate, endDate) {
  const bars = [];
  let pageToken = null;
  const baseUrl = `https://data.alpaca.markets/v2/stocks/${symbol}/bars`;
  do {
    const params = new URLSearchParams({
      timeframe: '1Day',
      start: new Date(startDate).toISOString(),
      end: new Date(endDate).toISOString(),
      limit: '1000',
      feed: 'iex',
    });
    if (pageToken) params.set('page_token', pageToken);
    const res = await fetch(`${baseUrl}?${params}`, {
      headers: { 'APCA-API-KEY-ID': ALPACA_KEY, 'APCA-API-SECRET-KEY': ALPACA_SECRET },
    });
    if (!res.ok) throw new Error(`Alpaca error: ${res.status} ${await res.text()}`);
    const data = await res.json();
    bars.push(...(data.bars || []));
    pageToken = data.next_page_token || null;
  } while (pageToken);
  return bars;
}

function simulateStrategy(bars, fastPeriod, slowPeriod, initialCapital, strategyType) {
  const closes = bars.map(b => b.c);
  const dates = bars.map(b => b.t.split('T')[0]);
  const trades = [];
  const dailyValues = [];

  let cash = initialCapital;
  let shares = 0;
  let entryPrice = 0;
  let prevFastAboveSlow = null;
  let peakValue = initialCapital;
  let maxDrawdown = 0;

  for (let i = 0; i < closes.length; i++) {
    const fastMA = calcMA(closes, fastPeriod, i);
    const slowMA = calcMA(closes, slowPeriod, i);
    const ma200 = calcMA(closes, 200, i);

    if (fastMA === null || slowMA === null) {
      dailyValues.push({ date: dates[i], value: cash + shares * closes[i] });
      continue;
    }

    const fastAboveSlow = fastMA > slowMA;
    const portfolioValue = cash + shares * closes[i];

    if (portfolioValue > peakValue) peakValue = portfolioValue;
    const drawdown = (peakValue - portfolioValue) / peakValue * 100;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    if (prevFastAboveSlow !== null && fastAboveSlow !== prevFastAboveSlow) {
      const isGoldenCross = fastAboveSlow;
      const covid = isCovidPeriod(dates[i]);
      const covidNote = covid ? ' ⚠️ COVID-19 market crash — extreme volatility' : '';

      if (isGoldenCross && cash > 0) {
        let shouldBuy = true;
        let reason = `Golden cross: fast MA (${fastMA.toFixed(2)}) crossed above slow MA (${slowMA.toFixed(2)})`;

        if (strategyType === 'consensus') {
          if (ma200 === null || closes[i] < ma200) {
            shouldBuy = false;
            reason += ' — below 200d MA, skipped';
          } else {
            reason += ' — above 200d MA, confirmed';
          }
        }

        if (shouldBuy) {
          const qty = Math.floor(cash / closes[i]);
          if (qty > 0) {
            const value = qty * closes[i];
            cash -= value;
            shares = qty;
            entryPrice = closes[i];
            trades.push({
              strategy: strategyType, action: 'buy', date: dates[i],
              price: closes[i], quantity: qty, value,
              result_dollars: null, result_pct: null,
              cumulative_portfolio_value: cash + shares * closes[i],
              ma_fast: fastMA, ma_slow: slowMA,
              signal_reason: reason + covidNote, is_covid_period: covid,
            });
          }
        }
      } else if (!isGoldenCross && shares > 0) {
        const value = shares * closes[i];
        const resultDollars = (closes[i] - entryPrice) * shares;
        const resultPct = (closes[i] - entryPrice) / entryPrice * 100;
        cash += value;
        trades.push({
          strategy: strategyType, action: 'sell', date: dates[i],
          price: closes[i], quantity: shares, value,
          result_dollars: resultDollars, result_pct: resultPct,
          cumulative_portfolio_value: cash,
          ma_fast: fastMA, ma_slow: slowMA,
          signal_reason: `Death cross: fast MA (${fastMA.toFixed(2)}) crossed below slow MA (${slowMA.toFixed(2)})` + covidNote,
          is_covid_period: isCovidPeriod(dates[i]),
        });
        shares = 0;
        entryPrice = 0;
      }
    }

    prevFastAboveSlow = fastAboveSlow;
    dailyValues.push({ date: dates[i], value: cash + shares * closes[i] });
  }

  // Close any open position at end
  if (shares > 0) {
    const lastClose = closes[closes.length - 1];
    const lastDate = dates[dates.length - 1];
    const value = shares * lastClose;
    const resultDollars = (lastClose - entryPrice) * shares;
    const resultPct = (lastClose - entryPrice) / entryPrice * 100;
    cash += value;
    trades.push({
      strategy: strategyType, action: 'sell', date: lastDate,
      price: lastClose, quantity: shares, value,
      result_dollars: resultDollars, result_pct: resultPct,
      cumulative_portfolio_value: cash,
      ma_fast: calcMA(closes, fastPeriod, closes.length - 1),
      ma_slow: calcMA(closes, slowPeriod, closes.length - 1),
      signal_reason: 'Period end — position liquidated',
      is_covid_period: isCovidPeriod(lastDate),
    });
    shares = 0;
  }

  const finalValue = cash;
  const sellTrades = trades.filter(t => t.action === 'sell' && t.result_dollars !== null);
  const winning = sellTrades.filter(t => t.result_dollars > 0);
  const losing = sellTrades.filter(t => t.result_dollars <= 0);
  const winRate = sellTrades.length > 0 ? (winning.length / sellTrades.length) * 100 : 0;
  const avgGain = winning.length > 0 ? winning.reduce((s, t) => s + t.result_pct, 0) / winning.length : 0;
  const avgLoss = losing.length > 0 ? losing.reduce((s, t) => s + t.result_pct, 0) / losing.length : 0;

  const vals = dailyValues.map(d => d.value);
  const dailyReturns = [];
  for (let i = 1; i < vals.length; i++) dailyReturns.push((vals[i] - vals[i - 1]) / vals[i - 1]);

  let sharpe = 0;
  if (dailyReturns.length > 1) {
    const avgDaily = dailyReturns.reduce((s, r) => s + r, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((s, r) => s + Math.pow(r - avgDaily, 2), 0) / dailyReturns.length;
    const stdDev = Math.sqrt(variance);
    const annualReturn = avgDaily * 252;
    const annualStd = stdDev * Math.sqrt(252);
    sharpe = annualStd > 0 ? (annualReturn - RISK_FREE_RATE) / annualStd : 0;
  }

  return {
    trades,
    dailyValues,
    stats: {
      total_return_pct: (finalValue - initialCapital) / initialCapital * 100,
      total_return_dollars: finalValue - initialCapital,
      win_rate: winRate,
      total_trades: sellTrades.length,
      winning_trades: winning.length,
      losing_trades: losing.length,
      avg_gain: avgGain,
      avg_loss: avgLoss,
      max_drawdown: maxDrawdown,
      sharpe_ratio: sharpe,
      final_value: finalValue,
    },
  };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const { symbol, start_date, end_date, fast_ma, slow_ma, initial_capital, strategies } = req.body || {};

    if (!symbol || !start_date || !end_date) {
      return res.status(400).json({ error: 'Missing required parameters: symbol, start_date, end_date' });
    }

    const fastPeriod = fast_ma || 5;
    const slowPeriod = slow_ma || 13;
    const capital = initial_capital || 500;
    const stratList = strategies || ['simple', 'consensus'];

    // Create backtest run record
    const runId = crypto.randomUUID();
    const { data: run, error: runError } = await supabase.from('backtest_runs').insert({
      strategy: stratList.length === 2 ? 'both' : stratList[0],
      symbol: symbol.toUpperCase(),
      start_date, end_date,
      fast_ma: fastPeriod, slow_ma: slowPeriod,
      initial_capital: capital,
      status: 'running',
      created_at: new Date().toISOString(),
    }).select().single();

    if (runError) throw new Error(runError.message);

    // Extend start by 1 year for MA warmup
    const extendedStart = new Date(start_date);
    extendedStart.setFullYear(extendedStart.getFullYear() - 1);
    const bars = await fetchAllBars(symbol.toUpperCase(), extendedStart.toISOString(), end_date);

    if (bars.length < slowPeriod + 5) {
      await supabase.from('backtest_runs').update({ status: 'failed' }).eq('id', run.id);
      return res.status(400).json({ error: 'Not enough historical data' });
    }

    let simpleResult = null;
    let consensusResult = null;
    const allTrades = [];

    if (stratList.includes('simple')) {
      simpleResult = simulateStrategy(bars, fastPeriod, slowPeriod, capital, 'simple');
      allTrades.push(...simpleResult.trades.map(t => ({ ...t, run_id: run.id, symbol: symbol.toUpperCase() })));
    }
    if (stratList.includes('consensus')) {
      consensusResult = simulateStrategy(bars, fastPeriod, slowPeriod, capital, 'consensus');
      allTrades.push(...consensusResult.trades.map(t => ({ ...t, run_id: run.id, symbol: symbol.toUpperCase() })));
    }

    // Insert trades in batches
    for (let i = 0; i < allTrades.length; i += 50) {
      await supabase.from('backtest_trades').insert(allTrades.slice(i, i + 50));
    }

    // Update run with stats
    const updatePayload = { status: 'complete' };
    if (simpleResult) {
      const s = simpleResult.stats;
      Object.assign(updatePayload, {
        total_return_pct: s.total_return_pct,
        total_return_dollars: s.total_return_dollars,
        win_rate: s.win_rate,
        total_trades: s.total_trades,
        winning_trades: s.winning_trades,
        losing_trades: s.losing_trades,
        avg_gain: s.avg_gain,
        avg_loss: s.avg_loss,
        max_drawdown: s.max_drawdown,
        sharpe_ratio: s.sharpe_ratio,
      });
    }

    await supabase.from('backtest_runs').update(updatePayload).eq('id', run.id);

    return res.status(200).json({
      run_id: run.id,
      simple: simpleResult ? { stats: simpleResult.stats, dailyValues: simpleResult.dailyValues } : null,
      consensus: consensusResult ? { stats: consensusResult.stats, dailyValues: consensusResult.dailyValues } : null,
    });
  } catch (error) {
    console.error('runBacktest error:', error);
    return res.status(500).json({ error: error.message });
  }
}
