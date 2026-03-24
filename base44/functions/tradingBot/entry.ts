import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const ALPACA_DATA_URL = 'https://data.alpaca.markets';

const PUSHOVER_USER_KEY = Deno.env.get('PUSHOVER_USER_KEY');
const PUSHOVER_APP_TOKEN = Deno.env.get('PUSHOVER_APP_TOKEN');
const PAPER_KEY = Deno.env.get('ALPACA_API_KEY');
const PAPER_SECRET = Deno.env.get('ALPACA_API_SECRET');
const LIVE_KEY = Deno.env.get('ALPACA_LIVE_API_KEY');
const LIVE_SECRET = Deno.env.get('ALPACA_LIVE_API_SECRET');

const LIVE_HARD_CAP = 25;          // max $ per live order
const LIVE_DAILY_LOSS_STOP = -5;   // stop bot if live account loses more than $5

async function sendPush(base44, { title, message, priority = 0, sound = 'pushover', trigger_type, symbol, value }) {
  const delivered_at = new Date().toISOString();
  try {
    if (!PUSHOVER_USER_KEY || !PUSHOVER_APP_TOKEN) throw new Error('Missing Pushover credentials');
    const formData = new URLSearchParams();
    formData.append('token', PUSHOVER_APP_TOKEN);
    formData.append('user', PUSHOVER_USER_KEY);
    formData.append('title', title);
    formData.append('message', message);
    formData.append('priority', String(priority));
    formData.append('sound', sound);
    const res = await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
      signal: AbortSignal.timeout(8000),
    });
    const result = await res.json().catch(() => ({}));
    const status = res.ok && result.status === 1 ? 'sent' : 'failed';
    await base44.asServiceRole.entities.NotificationLog.create({ trigger_type, title, message, symbol, value, delivered_at, status }).catch(() => {});
  } catch (e) {
    await base44.asServiceRole.entities.NotificationLog.create({ trigger_type, title, message, symbol, value, delivered_at, status: 'failed', error: e.message }).catch(() => {});
  }
}

function makeAlpacaHeaders(isLive) {
  const key = isLive ? LIVE_KEY : PAPER_KEY;
  const secret = isLive ? LIVE_SECRET : PAPER_SECRET;
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
  const headers = makeAlpacaHeaders(isLive);
  const baseUrl = getBaseUrl(isLive);
  const res = await fetch(`${baseUrl}/v2/clock`, { headers });
  if (!res.ok) return false;
  const data = await res.json();
  return data.is_open === true;
}

function calculateMA(prices, period) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

async function fetchBars(symbol, limit, isLive) {
  const headers = makeAlpacaHeaders(isLive);
  const url = `${ALPACA_DATA_URL}/v2/stocks/${symbol}/bars?timeframe=5Min&limit=${limit}&feed=iex`;
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Failed to fetch bars for ${symbol}: ${await res.text()}`);
  const data = await res.json();
  return (data.bars || []).map((b) => b.c);
}

async function getPositions(isLive) {
  const headers = makeAlpacaHeaders(isLive);
  const baseUrl = getBaseUrl(isLive);
  const res = await fetch(`${baseUrl}/v2/positions`, { headers });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function placeOrder(symbol, side, qty, notional, isLive) {
  const headers = makeAlpacaHeaders(isLive);
  const baseUrl = getBaseUrl(isLive);
  const orderBody = side === 'buy'
    ? { symbol, notional: parseFloat(notional).toFixed(2), side, type: 'market', time_in_force: 'day' }
    : { symbol, qty, side, type: 'market', time_in_force: 'day' };
  const res = await fetch(`${baseUrl}/v2/orders`, { method: 'POST', headers, body: JSON.stringify(orderBody) });
  if (!res.ok) throw new Error(`Order failed for ${symbol} ${side}: ${await res.text()}`);
  return await res.json();
}

function isAIVetoed(aiSignal, aiVetoEnabled) {
  if (!aiVetoEnabled || !aiSignal) return false;
  return aiSignal.overall_verdict === 'block';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runSimpleStrategy(base44, symbol, prices, fast_ma_period, slow_ma_period, max_per_trade, openPositions, strategyTag, consensusScore, consensus_threshold, aiSignal, aiVetoEnabled, isLive) {
  const prevPrices = prices.slice(0, -1);
  const currFastMA = calculateMA(prices, fast_ma_period);
  const currSlowMA = calculateMA(prices, slow_ma_period);
  const prevFastMA = calculateMA(prevPrices, fast_ma_period);
  const prevSlowMA = calculateMA(prevPrices, slow_ma_period);

  if (!currFastMA || !currSlowMA || !prevFastMA || !prevSlowMA) {
    return { symbol, message: 'Could not calculate MAs' };
  }

  const latestPrice = prices[prices.length - 1];
  const existingPosition = openPositions.find((p) => p.symbol === symbol);
  const hasPosition = existingPosition && parseFloat(existingPosition.qty) > 0;
  const goldenCross = prevFastMA <= prevSlowMA && currFastMA > currSlowMA;
  const deathCross = prevFastMA >= prevSlowMA && currFastMA < currSlowMA;
  const scoreLabel = consensusScore !== null ? `consensus ${consensusScore}/4` : 'no consensus data';

  // Effective trade amount — hard cap for live
  const effectiveAmount = isLive ? Math.min(max_per_trade, LIVE_HARD_CAP) : max_per_trade;

  if (goldenCross && !hasPosition) {
    if (consensusScore !== null && consensusScore < consensus_threshold) {
      return { symbol, action: 'hold', message: `Golden cross but ${scoreLabel} below threshold (${consensus_threshold})`, strategy: strategyTag };
    }
    if (isAIVetoed(aiSignal, aiVetoEnabled)) {
      await sendPush(base44, {
        title: 'AutoTrader: Trade Blocked 🛡️',
        message: `AI Guard blocked ${symbol} buy. Claude: ${aiSignal.claude_reasoning || 'N/A'}. GPT: ${aiSignal.gpt_reasoning || 'N/A'}`,
        priority: 0, sound: 'pushover', trigger_type: 'ai_veto_blocked', symbol,
      });
      return { symbol, action: 'hold', strategy: strategyTag, message: `AI veto blocked` };
    }
    if (effectiveAmount < 1) return { symbol, message: 'effectiveAmount must be at least $1' };

    // Live mode: 30-second signal confirmation delay
    if (isLive) {
      await sleep(30000);
      // Re-fetch prices and recheck signal
      let freshPrices;
      try {
        freshPrices = await fetchBars(symbol, slow_ma_period + 10, isLive);
      } catch (_) {
        return { symbol, action: 'hold', message: 'Live recheck fetch failed — skipping', strategy: strategyTag };
      }
      const freshFast = calculateMA(freshPrices, fast_ma_period);
      const freshSlow = calculateMA(freshPrices, slow_ma_period);
      if (!freshFast || !freshSlow || freshFast <= freshSlow) {
        return { symbol, action: 'hold', message: 'Live signal recheck: golden cross no longer valid — skipped', strategy: strategyTag };
      }
    }

    try {
      await placeOrder(symbol, 'buy', null, effectiveAmount, isLive);
      const totalValue = effectiveAmount;
      const aiNote = aiSignal ? ` | AI: ${aiSignal.overall_verdict}` : '';
      const liveTag = isLive ? ' [LIVE]' : '';
      await base44.asServiceRole.entities.Trade.create({
        symbol, action: 'buy', quantity: 0, price: latestPrice, total_value: totalValue,
        status: 'executed', strategy: strategyTag, is_live: isLive,
        reason: `[${strategyTag}${liveTag}] Golden cross | ${scoreLabel}${aiNote} | notional $${totalValue}`,
        executed_at: new Date().toISOString(),
      });
      await base44.asServiceRole.entities.Position.create({
        symbol, quantity: totalValue / latestPrice, avg_entry_price: latestPrice, current_price: latestPrice,
        market_value: totalValue, unrealized_pl: 0, unrealized_pl_pct: 0,
      });
      if (isLive) {
        await sendPush(base44, {
          title: `🔴 LIVE TRADE — BUY $${totalValue} of ${symbol}`,
          message: `LIVE BUY: $${totalValue} notional of ${symbol} at ~$${latestPrice.toFixed(2)}. Strategy: ${strategyTag}`,
          priority: 1, sound: 'cashregister', trigger_type: 'trade_executed', symbol, value: String(totalValue.toFixed(2)),
        });
      } else {
        await sendPush(base44, {
          title: `AutoTrader: BUY Executed`,
          message: `$${totalValue} notional of ${symbol} bought at ~$${latestPrice.toFixed(2)}. Strategy: ${strategyTag}`,
          priority: 0, sound: 'cashregister', trigger_type: 'trade_executed', symbol, value: String(totalValue.toFixed(2)),
        });
      }
      return { symbol, action: 'buy', notional: totalValue, price: latestPrice, strategy: strategyTag, consensus_score: consensusScore, is_live: isLive };
    } catch (e) {
      await base44.asServiceRole.entities.Trade.create({
        symbol, action: 'buy', quantity: 0, price: latestPrice, total_value: 0,
        status: 'failed', strategy: strategyTag, is_live: isLive, reason: e.message, executed_at: new Date().toISOString(),
      });
      return { symbol, error: e.message };
    }
  } else if (deathCross && hasPosition) {
    if (consensusScore !== null && consensusScore > 2) {
      return { symbol, action: 'hold', message: `Death cross but ${scoreLabel} still above 2 — holding`, strategy: strategyTag };
    }
    const qty = parseFloat(existingPosition.qty);
    const avgEntry = parseFloat(existingPosition.avg_entry_price);
    try {
      await placeOrder(symbol, 'sell', qty, null, isLive);
      const totalValue = qty * latestPrice;
      const tradeResult = (latestPrice - avgEntry) * qty;
      const liveTag = isLive ? ' [LIVE]' : '';
      await base44.asServiceRole.entities.Trade.create({
        symbol, action: 'sell', quantity: qty, price: latestPrice, total_value: totalValue,
        result: tradeResult, status: 'executed', strategy: strategyTag, is_live: isLive,
        reason: `[${strategyTag}${liveTag}] Death cross | ${scoreLabel}`,
        executed_at: new Date().toISOString(),
      });
      const positionRecords = await base44.asServiceRole.entities.Position.filter({ symbol });
      for (const pr of positionRecords) await base44.asServiceRole.entities.Position.delete(pr.id);
      if (isLive) {
        await sendPush(base44, {
          title: `🔴 LIVE TRADE — SELL ${symbol} at $${latestPrice.toFixed(2)}`,
          message: `LIVE SELL: ${qty} shares of ${symbol} at $${latestPrice.toFixed(2)}. Total: $${totalValue.toFixed(2)}. P&L: ${tradeResult >= 0 ? '+' : ''}$${tradeResult.toFixed(2)}`,
          priority: 1, sound: 'cashregister', trigger_type: 'trade_executed', symbol, value: String(totalValue.toFixed(2)),
        });
      } else {
        await sendPush(base44, {
          title: `AutoTrader: SELL Executed`,
          message: `${qty} shares of ${symbol} sold at $${latestPrice.toFixed(2)}. Total: $${totalValue.toFixed(2)}. Strategy: ${strategyTag}`,
          priority: 0, sound: 'cashregister', trigger_type: 'trade_executed', symbol, value: String(totalValue.toFixed(2)),
        });
      }
      return { symbol, action: 'sell', qty, price: latestPrice, result: tradeResult, strategy: strategyTag, is_live: isLive };
    } catch (e) {
      await base44.asServiceRole.entities.Trade.create({
        symbol, action: 'sell', quantity: qty, price: latestPrice, total_value: qty * latestPrice,
        status: 'failed', strategy: strategyTag, is_live: isLive, reason: e.message, executed_at: new Date().toISOString(),
      });
      return { symbol, error: e.message };
    }
  } else {
    if (hasPosition) {
      const positionRecords = await base44.asServiceRole.entities.Position.filter({ symbol });
      for (const pr of positionRecords) {
        const marketValue = pr.quantity * latestPrice;
        const unrealizedPL = (latestPrice - pr.avg_entry_price) * pr.quantity;
        const unrealizedPLPct = ((latestPrice - pr.avg_entry_price) / pr.avg_entry_price) * 100;
        await base44.asServiceRole.entities.Position.update(pr.id, {
          current_price: latestPrice, market_value: marketValue,
          unrealized_pl: unrealizedPL, unrealized_pl_pct: unrealizedPLPct,
        });
      }
    }
    return { symbol, action: 'hold', fast_ma: currFastMA.toFixed(2), slow_ma: currSlowMA.toFixed(2), strategy: strategyTag };
  }
}

async function runConsensusStrategy(base44, symbol, prices, fast_ma_period, slow_ma_period, max_per_trade, openPositions, strategyTag, consensusScore, consensus_threshold, aiSignal, aiVetoEnabled, isLive) {
  const prevPrices = prices.slice(0, -1);
  const currFastMA = calculateMA(prices, fast_ma_period);
  const currSlowMA = calculateMA(prices, slow_ma_period);
  const prevFastMA = calculateMA(prevPrices, fast_ma_period);
  const prevSlowMA = calculateMA(prevPrices, slow_ma_period);

  if (!currFastMA || !currSlowMA || !prevFastMA || !prevSlowMA) {
    return { symbol, message: 'Could not calculate MAs', strategy: strategyTag };
  }

  const latestPrice = prices[prices.length - 1];
  const existingPosition = openPositions.find((p) => p.symbol === symbol);
  const hasPosition = existingPosition && parseFloat(existingPosition.qty) > 0;
  const goldenCross = prevFastMA <= prevSlowMA && currFastMA > currSlowMA;
  const deathCross = prevFastMA >= prevSlowMA && currFastMA < currSlowMA;
  const score = consensusScore ?? 0;
  const scoreLabel = `consensus ${score}/4`;

  const effectiveAmount = isLive ? Math.min(max_per_trade, LIVE_HARD_CAP) : max_per_trade;

  if (goldenCross && !hasPosition && score >= consensus_threshold) {
    if (isAIVetoed(aiSignal, aiVetoEnabled)) {
      await sendPush(base44, {
        title: 'AutoTrader: Trade Blocked 🛡️',
        message: `AI Guard blocked ${symbol} buy. Claude: ${aiSignal.claude_reasoning || 'N/A'}. GPT: ${aiSignal.gpt_reasoning || 'N/A'}`,
        priority: 0, sound: 'pushover', trigger_type: 'ai_veto_blocked', symbol,
      });
      return { symbol, action: 'hold', strategy: strategyTag, message: `AI veto blocked` };
    }
    if (effectiveAmount < 1) return { symbol, message: 'effectiveAmount must be at least $1' };

    // Live mode: 30-second signal confirmation delay
    if (isLive) {
      await sleep(30000);
      let freshPrices;
      try {
        freshPrices = await fetchBars(symbol, slow_ma_period + 10, isLive);
      } catch (_) {
        return { symbol, action: 'hold', message: 'Live recheck fetch failed — skipping', strategy: strategyTag };
      }
      const freshFast = calculateMA(freshPrices, fast_ma_period);
      const freshSlow = calculateMA(freshPrices, slow_ma_period);
      if (!freshFast || !freshSlow || freshFast <= freshSlow) {
        return { symbol, action: 'hold', message: 'Live signal recheck: golden cross no longer valid — skipped', strategy: strategyTag };
      }
    }

    try {
      await placeOrder(symbol, 'buy', null, effectiveAmount, isLive);
      const totalValue = effectiveAmount;
      const aiNote = aiSignal ? ` | AI: ${aiSignal.overall_verdict}` : '';
      const liveTag = isLive ? ' [LIVE]' : '';
      await base44.asServiceRole.entities.Trade.create({
        symbol, action: 'buy', quantity: 0, price: latestPrice, total_value: totalValue,
        status: 'executed', strategy: strategyTag, is_live: isLive,
        reason: `[${strategyTag}${liveTag}] Golden cross confirmed by ${scoreLabel}${aiNote} | notional $${totalValue}`,
        executed_at: new Date().toISOString(),
      });
      await base44.asServiceRole.entities.Position.create({
        symbol, quantity: totalValue / latestPrice, avg_entry_price: latestPrice, current_price: latestPrice,
        market_value: totalValue, unrealized_pl: 0, unrealized_pl_pct: 0,
      });
      if (isLive) {
        await sendPush(base44, {
          title: `🔴 LIVE TRADE — BUY $${totalValue} of ${symbol}`,
          message: `LIVE BUY: $${totalValue} notional of ${symbol} at ~$${latestPrice.toFixed(2)}. Strategy: ${strategyTag}`,
          priority: 1, sound: 'cashregister', trigger_type: 'trade_executed', symbol, value: String(totalValue.toFixed(2)),
        });
      } else {
        await sendPush(base44, {
          title: `AutoTrader: BUY Executed`,
          message: `$${totalValue} notional of ${symbol} bought at ~$${latestPrice.toFixed(2)}. Strategy: ${strategyTag}`,
          priority: 0, sound: 'cashregister', trigger_type: 'trade_executed', symbol, value: String(totalValue.toFixed(2)),
        });
      }
      return { symbol, action: 'buy', notional: totalValue, price: latestPrice, score, strategy: strategyTag, is_live: isLive };
    } catch (e) {
      await base44.asServiceRole.entities.Trade.create({
        symbol, action: 'buy', quantity: 0, price: latestPrice, total_value: 0,
        status: 'failed', strategy: strategyTag, is_live: isLive, reason: e.message, executed_at: new Date().toISOString(),
      });
      return { symbol, error: e.message };
    }
  } else if (deathCross && hasPosition && score <= 2) {
    const qty = parseFloat(existingPosition.qty);
    const avgEntry = parseFloat(existingPosition.avg_entry_price);
    try {
      await placeOrder(symbol, 'sell', qty, null, isLive);
      const totalValue = qty * latestPrice;
      const tradeResult = (latestPrice - avgEntry) * qty;
      const liveTag = isLive ? ' [LIVE]' : '';
      await base44.asServiceRole.entities.Trade.create({
        symbol, action: 'sell', quantity: qty, price: latestPrice, total_value: totalValue,
        result: tradeResult, status: 'executed', strategy: strategyTag, is_live: isLive,
        reason: `[${strategyTag}${liveTag}] Death cross confirmed by ${scoreLabel}`,
        executed_at: new Date().toISOString(),
      });
      const positionRecords = await base44.asServiceRole.entities.Position.filter({ symbol });
      for (const pr of positionRecords) await base44.asServiceRole.entities.Position.delete(pr.id);
      if (isLive) {
        await sendPush(base44, {
          title: `🔴 LIVE TRADE — SELL ${symbol} at $${latestPrice.toFixed(2)}`,
          message: `LIVE SELL: ${qty} shares of ${symbol} at $${latestPrice.toFixed(2)}. Total: $${totalValue.toFixed(2)}. P&L: ${tradeResult >= 0 ? '+' : ''}$${tradeResult.toFixed(2)}`,
          priority: 1, sound: 'cashregister', trigger_type: 'trade_executed', symbol, value: String(totalValue.toFixed(2)),
        });
      } else {
        await sendPush(base44, {
          title: `AutoTrader: SELL Executed`,
          message: `${qty} shares of ${symbol} sold at $${latestPrice.toFixed(2)}. Total: $${totalValue.toFixed(2)}. Strategy: ${strategyTag}`,
          priority: 0, sound: 'cashregister', trigger_type: 'trade_executed', symbol, value: String(totalValue.toFixed(2)),
        });
      }
      return { symbol, action: 'sell', qty, price: latestPrice, result: tradeResult, score, strategy: strategyTag, is_live: isLive };
    } catch (e) {
      await base44.asServiceRole.entities.Trade.create({
        symbol, action: 'sell', quantity: qty, price: latestPrice, total_value: qty * latestPrice,
        status: 'failed', strategy: strategyTag, is_live: isLive, reason: e.message, executed_at: new Date().toISOString(),
      });
      return { symbol, error: e.message };
    }
  }

  return { symbol, action: 'hold', score, fast_ma: currFastMA.toFixed(2), slow_ma: currSlowMA.toFixed(2), strategy: strategyTag };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Determine trading mode
    const tradingModes = await base44.asServiceRole.entities.TradingMode.list('-activated_at', 1);
    const currentMode = tradingModes[0]?.mode || 'paper';
    const isLive = currentMode === 'live';

    // Verify live credentials available
    if (isLive && (!LIVE_KEY || !LIVE_SECRET)) {
      return Response.json({ error: 'Live mode active but ALPACA_LIVE_API_KEY / ALPACA_LIVE_API_SECRET not set.', ran_at: new Date().toISOString() });
    }

    if (!await isMarketOpen(isLive)) {
      return Response.json({ message: 'Market is not open, skipping.', mode: currentMode, ran_at: new Date().toISOString() });
    }

    const settingsList = await base44.asServiceRole.entities.StrategySettings.list('-created_date', 1);
    const settings = settingsList[0];

    if (!settings) return Response.json({ message: 'No strategy settings configured.' });
    if (!settings.bot_enabled) return Response.json({ message: 'Bot is disabled.' });

    const {
      watchlist = [],
      max_per_trade = 1000,
      daily_loss_limit = 500,
      fast_ma_period = 5,
      slow_ma_period = 13,
      strategy_mode = 'simple',
      consensus_threshold = 2,
      ai_veto_enabled = true,
    } = settings;

    if (watchlist.length === 0) return Response.json({ message: 'Watchlist is empty.' });

    const today = new Date().toISOString().split('T')[0];
    const allTodayTrades = await base44.asServiceRole.entities.Trade.list('-executed_at', 200);
    const todayTrades = allTodayTrades.filter((t) => t.executed_at && t.executed_at.startsWith(today));

    // Separate daily loss check for live vs paper
    const liveTodayTrades = todayTrades.filter((t) => t.is_live === true);
    const paperTodayTrades = todayTrades.filter((t) => !t.is_live);
    const dailyLoss = (isLive ? liveTodayTrades : paperTodayTrades).reduce((sum, t) => sum + (t.result || 0), 0);

    // Live hard stop: $5 daily loss
    if (isLive && dailyLoss <= LIVE_DAILY_LOSS_STOP) {
      await sendPush(base44, {
        title: '🚨 LIVE TRADING EMERGENCY STOP',
        message: `LIVE bot stopped! Daily loss $${Math.abs(dailyLoss).toFixed(2)} exceeded $${Math.abs(LIVE_DAILY_LOSS_STOP)} hard stop. Bot disabled.`,
        priority: 2, sound: 'siren', trigger_type: 'daily_loss_limit', value: String(dailyLoss.toFixed(2)),
      });
      // Disable the bot
      await base44.asServiceRole.entities.StrategySettings.update(settings.id, { bot_enabled: false }).catch(() => {});
      return Response.json({ message: `LIVE daily loss hard stop hit ($${Math.abs(dailyLoss).toFixed(2)}). Bot disabled.`, daily_loss: dailyLoss });
    }

    // Paper daily loss check
    if (!isLive && dailyLoss <= -daily_loss_limit) {
      await sendPush(base44, {
        title: 'AutoTrader: ⚠️ Daily Loss Limit Hit',
        message: `Bot stopped for today. Total loss: $${Math.abs(dailyLoss).toFixed(2)} exceeded limit of $${daily_loss_limit}`,
        priority: 1, sound: 'siren', trigger_type: 'daily_loss_limit', value: String(dailyLoss.toFixed(2)),
      });
      return Response.json({ message: `Daily loss limit of $${daily_loss_limit} hit.`, daily_loss: dailyLoss });
    }

    // Fetch consensus scores + AI signals, auto-refresh if stale (> 24 hours)
    let [allScores, allAISignals] = await Promise.all([
      base44.asServiceRole.entities.ConsensusScore.list('-scored_at', 200),
      base44.asServiceRole.entities.AISignal.list('-analyzed_at', 200),
    ]);

    const staleThreshold = Date.now() - 24 * 60 * 60 * 1000;
    const latestScore = allScores[0];
    const isStale = !latestScore || new Date(latestScore.scored_at).getTime() < staleThreshold;
    if (isStale) {
      await base44.functions.invoke('scoreConsensus', {}).catch(() => {});
      await base44.asServiceRole.entities.StrategySettings.update(settings.id, {
        consensus_refreshed_at: new Date().toISOString(),
      }).catch(() => {});
      allScores = await base44.asServiceRole.entities.ConsensusScore.list('-scored_at', 200).catch(() => allScores);
    }

    const consensusMap = {};
    for (const cs of allScores) {
      if (!consensusMap[cs.symbol]) consensusMap[cs.symbol] = cs;
    }
    const aiSignalMap = {};
    for (const ai of allAISignals) {
      if (!aiSignalMap[ai.symbol]) aiSignalMap[ai.symbol] = ai;
    }

    const openPositions = await getPositions(isLive);
    const results = [];

    for (const symbol of watchlist) {
      const neededBars = slow_ma_period + 10;
      let prices;
      try {
        prices = await fetchBars(symbol, neededBars, isLive);
      } catch (e) {
        results.push({ symbol, error: e.message });
        continue;
      }

      if (prices.length < slow_ma_period + 1) {
        results.push({ symbol, message: 'Not enough price data' });
        continue;
      }

      const csScore = consensusMap[symbol]?.total_score ?? null;
      const aiSignal = aiSignalMap[symbol] || aiSignalMap[symbol?.toUpperCase()] || null;

      if (strategy_mode === 'simple') {
        results.push(await runSimpleStrategy(base44, symbol, prices, fast_ma_period, slow_ma_period, max_per_trade, openPositions, 'Simple', csScore, consensus_threshold, aiSignal, ai_veto_enabled, isLive));
      } else if (strategy_mode === 'consensus') {
        results.push(await runConsensusStrategy(base44, symbol, prices, fast_ma_period, slow_ma_period, max_per_trade, openPositions, 'Consensus', csScore, consensus_threshold, aiSignal, ai_veto_enabled, isLive));
      } else if (strategy_mode === 'both') {
        const halfBudget = max_per_trade / 2;
        results.push(await runSimpleStrategy(base44, symbol, prices, fast_ma_period, slow_ma_period, halfBudget, openPositions, 'Simple', csScore, consensus_threshold, aiSignal, ai_veto_enabled, isLive));
        results.push(await runConsensusStrategy(base44, symbol, prices, fast_ma_period, slow_ma_period, halfBudget, openPositions, 'Consensus', csScore, consensus_threshold, aiSignal, ai_veto_enabled, isLive));
      }
    }

    return Response.json({ success: true, ran_at: new Date().toISOString(), mode: currentMode, strategy_mode, daily_loss: dailyLoss, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});