// api/tradingBot.js
// Vercel Serverless Function - replaces Base44 tradingBot function
// Called by Vercel Cron every 15 minutes during market hours

import { supabase, getSettings, getTradingMode, sendPush } from '../lib/supabase.js';

const ALPACA_DATA_URL = 'https://data.alpaca.markets';
const LIVE_HARD_CAP = 25;
const LIVE_DAILY_LOSS_STOP = -5;

function makeAlpacaHeaders(isLive) {
  const key = isLive ? process.env.ALPACA_LIVE_API_KEY : process.env.ALPACA_API_KEY;
  const secret = isLive ? process.env.ALPACA_LIVE_API_SECRET : process.env.ALPACA_API_SECRET;
  return {
    'APCA-API-KEY-ID': key,
    'APCA-API-SECRET-KEY': secret,
    'Content-Type': 'application/json',
  };
}

function getBaseUrl(isLive) {
  return isLive ? 'https://api.alpaca.markets' : 'https://paper-api.alpaca.markets';
}

async function isMarketOpen(isLive) {
  try {
    const res = await fetch(`${getBaseUrl(isLive)}/v2/clock`, { headers: makeAlpacaHeaders(isLive) });
    if (!res.ok) return false;
    const data = await res.json();
    return data.is_open === true;
  } catch { return false; }
}

function calculateMA(prices, period) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

async function fetchBars(symbol, limit, isLive) {
  const url = `${ALPACA_DATA_URL}/v2/stocks/${symbol}/bars?timeframe=5Min&limit=${limit}&feed=iex`;
  const res = await fetch(url, { headers: makeAlpacaHeaders(isLive) });
  if (!res.ok) throw new Error(`Failed to fetch bars for ${symbol}: ${await res.text()}`);
  const data = await res.json();
  return (data.bars || []).map(b => b.c);
}

async function getPositions(isLive) {
  try {
    const res = await fetch(`${getBaseUrl(isLive)}/v2/positions`, { headers: makeAlpacaHeaders(isLive) });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch { return []; }
}

async function placeOrder(symbol, side, qty, notional, isLive) {
  const orderBody = side === 'buy'
    ? { symbol, notional: parseFloat(notional).toFixed(2), side, type: 'market', time_in_force: 'day' }
    : { symbol, qty, side, type: 'market', time_in_force: 'day' };
  const res = await fetch(`${getBaseUrl(isLive)}/v2/orders`, {
    method: 'POST',
    headers: makeAlpacaHeaders(isLive),
    body: JSON.stringify(orderBody)
  });
  if (!res.ok) throw new Error(`Order failed for ${symbol} ${side}: ${await res.text()}`);
  return res.json();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function isAIVetoed(aiSignal, aiVetoEnabled) {
  if (!aiVetoEnabled || !aiSignal) return false;
  return aiSignal.overall_verdict === 'block';
}

async function runSimpleStrategy(symbol, prices, settings, openPositions, consensusScore, aiSignal, isLive) {
  const { fast_ma_period, slow_ma_period, max_per_trade, consensus_threshold, ai_veto_enabled } = settings;
  const prevPrices = prices.slice(0, -1);
  const currFastMA = calculateMA(prices, fast_ma_period);
  const currSlowMA = calculateMA(prices, slow_ma_period);
  const prevFastMA = calculateMA(prevPrices, fast_ma_period);
  const prevSlowMA = calculateMA(prevPrices, slow_ma_period);

  if (!currFastMA || !currSlowMA || !prevFastMA || !prevSlowMA) {
    return { symbol, message: 'Could not calculate MAs' };
  }

  const latestPrice = prices[prices.length - 1];
  const existingPosition = openPositions.find(p => p.symbol === symbol);
  const hasPosition = existingPosition && parseFloat(existingPosition.qty) > 0;
  const goldenCross = prevFastMA <= prevSlowMA && currFastMA > currSlowMA;
  const deathCross = prevFastMA >= prevSlowMA && currFastMA < currSlowMA;
  const scoreLabel = consensusScore !== null ? `consensus ${consensusScore}/4` : 'no consensus data';
  const effectiveAmount = isLive ? Math.min(max_per_trade, LIVE_HARD_CAP) : max_per_trade;

  if (goldenCross && !hasPosition) {
    if (consensusScore !== null && consensusScore < consensus_threshold) {
      return { symbol, action: 'hold', message: `Golden cross but ${scoreLabel} below threshold`, strategy: 'Simple' };
    }
    if (isAIVetoed(aiSignal, ai_veto_enabled)) {
      await sendPush({
        title: 'AutoTrader: Trade Blocked 🛡️',
        message: `AI Guard blocked ${symbol} buy. Claude: ${aiSignal.claude_reasoning || 'N/A'}. GPT: ${aiSignal.gpt_reasoning || 'N/A'}`,
        priority: 0, sound: 'pushover', trigger_type: 'ai_veto_blocked', symbol,
      });
      return { symbol, action: 'hold', strategy: 'Simple', message: 'AI veto blocked' };
    }
    if (effectiveAmount < 1) return { symbol, message: 'effectiveAmount must be at least $1' };

    if (isLive) {
      await sleep(30000);
      let freshPrices;
      try { freshPrices = await fetchBars(symbol, slow_ma_period + 10, isLive); }
      catch (_) { return { symbol, action: 'hold', message: 'Live recheck fetch failed', strategy: 'Simple' }; }
      const freshFast = calculateMA(freshPrices, fast_ma_period);
      const freshSlow = calculateMA(freshPrices, slow_ma_period);
      if (!freshFast || !freshSlow || freshFast <= freshSlow) {
        return { symbol, action: 'hold', message: 'Live signal recheck: golden cross no longer valid', strategy: 'Simple' };
      }
    }

    try {
      await placeOrder(symbol, 'buy', null, effectiveAmount, isLive);
      const liveTag = isLive ? ' [LIVE]' : '';
      await supabase.from('trades').insert({
        symbol, action: 'buy', quantity: 0, price: latestPrice, total_value: effectiveAmount,
        status: 'executed', strategy: 'Simple', is_live: isLive,
        reason: `[Simple${liveTag}] Golden cross | ${scoreLabel} | notional $${effectiveAmount}`,
        executed_at: new Date().toISOString(),
      });
      await supabase.from('positions').insert({
        symbol, quantity: effectiveAmount / latestPrice, avg_entry_price: latestPrice,
        current_price: latestPrice, market_value: effectiveAmount, unrealized_pl: 0, unrealized_pl_pct: 0,
      });
      await sendPush({
        title: isLive ? `🔴 LIVE TRADE — BUY $${effectiveAmount} of ${symbol}` : `AutoTrader: BUY Executed`,
        message: isLive
          ? `LIVE BUY: $${effectiveAmount} notional of ${symbol} at ~$${latestPrice.toFixed(2)}`
          : `$${effectiveAmount} notional of ${symbol} bought at ~$${latestPrice.toFixed(2)}. Strategy: Simple`,
        priority: isLive ? 1 : 0, sound: 'cashregister', trigger_type: 'trade_executed', symbol,
        value: String(effectiveAmount.toFixed(2)),
      });
      return { symbol, action: 'buy', notional: effectiveAmount, price: latestPrice, strategy: 'Simple', is_live: isLive };
    } catch (e) {
      await supabase.from('trades').insert({
        symbol, action: 'buy', quantity: 0, price: latestPrice, total_value: 0,
        status: 'failed', strategy: 'Simple', is_live: isLive, reason: e.message, executed_at: new Date().toISOString(),
      });
      return { symbol, error: e.message };
    }

  } else if (deathCross && hasPosition) {
    if (consensusScore !== null && consensusScore > 2) {
      return { symbol, action: 'hold', message: `Death cross but ${scoreLabel} still above 2`, strategy: 'Simple' };
    }
    const qty = parseFloat(existingPosition.qty);
    const avgEntry = parseFloat(existingPosition.avg_entry_price);
    try {
      await placeOrder(symbol, 'sell', qty, null, isLive);
      const totalValue = qty * latestPrice;
      const tradeResult = (latestPrice - avgEntry) * qty;
      const liveTag = isLive ? ' [LIVE]' : '';
      await supabase.from('trades').insert({
        symbol, action: 'sell', quantity: qty, price: latestPrice, total_value: totalValue,
        result: tradeResult, status: 'executed', strategy: 'Simple', is_live: isLive,
        reason: `[Simple${liveTag}] Death cross | ${scoreLabel}`,
        executed_at: new Date().toISOString(),
      });
      await supabase.from('positions').delete().eq('symbol', symbol);
      await sendPush({
        title: isLive ? `🔴 LIVE TRADE — SELL ${symbol} at $${latestPrice.toFixed(2)}` : `AutoTrader: SELL Executed`,
        message: isLive
          ? `LIVE SELL: ${qty} shares of ${symbol} at $${latestPrice.toFixed(2)}. P&L: ${tradeResult >= 0 ? '+' : ''}$${tradeResult.toFixed(2)}`
          : `${qty} shares of ${symbol} sold at $${latestPrice.toFixed(2)}. Strategy: Simple`,
        priority: isLive ? 1 : 0, sound: 'cashregister', trigger_type: 'trade_executed', symbol,
        value: String(totalValue.toFixed(2)),
      });
      return { symbol, action: 'sell', qty, price: latestPrice, result: tradeResult, strategy: 'Simple', is_live: isLive };
    } catch (e) {
      await supabase.from('trades').insert({
        symbol, action: 'sell', quantity: qty, price: latestPrice, total_value: qty * latestPrice,
        status: 'failed', strategy: 'Simple', is_live: isLive, reason: e.message, executed_at: new Date().toISOString(),
      });
      return { symbol, error: e.message };
    }
  }

  return { symbol, action: 'hold', fast_ma: currFastMA.toFixed(2), slow_ma: currSlowMA.toFixed(2), strategy: 'Simple' };
}

export default async function handler(req, res) {
  // Allow both GET (cron) and POST (manual trigger)
  try {
    const { mode: currentMode } = await getTradingMode();
    const isLive = currentMode === 'live';

    if (isLive && (!process.env.ALPACA_LIVE_API_KEY || !process.env.ALPACA_LIVE_API_SECRET)) {
      return res.status(400).json({ error: 'Live mode active but live API keys not set.' });
    }

    const marketOpen = await isMarketOpen(isLive);
    if (!marketOpen) {
      return res.status(200).json({ message: 'Market is not open, skipping.', mode: currentMode, ran_at: new Date().toISOString() });
    }

    const settings = await getSettings();
    if (!settings) return res.status(200).json({ message: 'No strategy settings configured.' });
    if (!settings.bot_enabled) return res.status(200).json({ message: 'Bot is disabled.' });

    const { watchlist = [], daily_loss_limit = 500, strategy_mode = 'simple', max_per_trade = 500 } = settings;
    if (watchlist.length === 0) return res.status(200).json({ message: 'Watchlist is empty.' });

    // Daily loss check
    const today = new Date().toISOString().split('T')[0];
    const { data: todayTrades = [] } = await supabase
      .from('trades')
      .select('result, is_live')
      .gte('executed_at', today)
      .eq('status', 'executed');

    const relevantTrades = todayTrades.filter(t => isLive ? t.is_live === true : !t.is_live);
    const dailyLoss = relevantTrades.reduce((sum, t) => sum + (t.result || 0), 0);

    if (isLive && dailyLoss <= LIVE_DAILY_LOSS_STOP) {
      await sendPush({
        title: '🚨 LIVE TRADING EMERGENCY STOP',
        message: `LIVE bot stopped! Daily loss $${Math.abs(dailyLoss).toFixed(2)} exceeded $${Math.abs(LIVE_DAILY_LOSS_STOP)} hard stop.`,
        priority: 2, sound: 'siren', trigger_type: 'daily_loss_limit',
      });
      await supabase.from('strategy_settings').update({ bot_enabled: false }).eq('id', settings.id);
      return res.status(200).json({ message: 'LIVE daily loss hard stop hit. Bot disabled.', daily_loss: dailyLoss });
    }

    if (!isLive && dailyLoss <= -daily_loss_limit) {
      await sendPush({
        title: 'AutoTrader: ⚠️ Daily Loss Limit Hit',
        message: `Bot stopped for today. Total loss: $${Math.abs(dailyLoss).toFixed(2)} exceeded limit of $${daily_loss_limit}`,
        priority: 1, sound: 'siren', trigger_type: 'daily_loss_limit',
      });
      return res.status(200).json({ message: `Daily loss limit hit.`, daily_loss: dailyLoss });
    }

    // Fetch consensus and AI signals
    const [{ data: consensusRows = [] }, { data: aiRows = [] }] = await Promise.all([
      supabase.from('consensus_scores').select('*'),
      supabase.from('ai_signals').select('*'),
    ]);

    const consensusMap = Object.fromEntries(consensusRows.map(r => [r.symbol.toUpperCase(), r]));
    const aiSignalMap = Object.fromEntries(aiRows.map(r => [r.symbol.toUpperCase(), r]));

    const openPositions = await getPositions(isLive);
    const results = [];

    for (const symbol of watchlist) {
      const neededBars = settings.slow_ma_period + 10;
      let prices;
      try { prices = await fetchBars(symbol, neededBars, isLive); }
      catch (e) { results.push({ symbol, error: e.message }); continue; }

      if (prices.length < settings.slow_ma_period + 1) {
        results.push({ symbol, message: 'Not enough price data' });
        continue;
      }

      const csScore = consensusMap[symbol.toUpperCase()]?.total_score ?? null;
      const aiSignal = aiSignalMap[symbol.toUpperCase()] || null;

      if (strategy_mode === 'simple' || strategy_mode === 'both') {
        const budget = strategy_mode === 'both' ? max_per_trade / 2 : max_per_trade;
        results.push(await runSimpleStrategy(symbol, prices, { ...settings, max_per_trade: budget }, openPositions, csScore, aiSignal, isLive));
      }
      // Consensus strategy would go here for strategy_mode === 'consensus' or 'both'
    }

    return res.status(200).json({
      success: true, ran_at: new Date().toISOString(), mode: currentMode, strategy_mode, daily_loss: dailyLoss, results
    });

  } catch (error) {
    console.error('TradingBot error:', error);
    return res.status(500).json({ error: error.message });
  }
}
