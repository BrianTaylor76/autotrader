import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const ALPACA_BASE_URL = 'https://paper-api.alpaca.markets';
const ALPACA_DATA_URL = 'https://data.alpaca.markets';

const ALPACA_KEY = Deno.env.get('ALPACA_API_KEY');
const ALPACA_SECRET = Deno.env.get('ALPACA_API_SECRET');

const alpacaHeaders = {
  'APCA-API-KEY-ID': ALPACA_KEY,
  'APCA-API-SECRET-KEY': ALPACA_SECRET,
  'Content-Type': 'application/json',
};

async function isMarketOpen() {
  const res = await fetch(`${ALPACA_BASE_URL}/v2/clock`, { headers: alpacaHeaders });
  if (!res.ok) return false;
  const data = await res.json();
  return data.is_open === true;
}

function calculateMA(prices, period) {
  if (prices.length < period) return null;
  const slice = prices.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

async function fetchBars(symbol, limit) {
  const url = `${ALPACA_DATA_URL}/v2/stocks/${symbol}/bars?timeframe=1Min&limit=${limit}&feed=iex`;
  const res = await fetch(url, { headers: alpacaHeaders });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to fetch bars for ${symbol}: ${err}`);
  }
  const data = await res.json();
  return (data.bars || []).map((b) => b.c);
}

async function getPositions() {
  const res = await fetch(`${ALPACA_BASE_URL}/v2/positions`, { headers: alpacaHeaders });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function placeOrder(symbol, side, qty) {
  const body = JSON.stringify({ symbol, qty, side, type: 'market', time_in_force: 'day' });
  const res = await fetch(`${ALPACA_BASE_URL}/v2/orders`, {
    method: 'POST',
    headers: alpacaHeaders,
    body,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Order failed for ${symbol} ${side}: ${err}`);
  }
  return await res.json();
}

// Consensus scoring: returns a score 0-4 and signals breakdown
function scoreConsensus(prices, fast_ma_period, slow_ma_period) {
  if (prices.length < slow_ma_period + 1) return { score: 0, direction: null };

  const prevPrices = prices.slice(0, -1);
  const currFastMA = calculateMA(prices, fast_ma_period);
  const currSlowMA = calculateMA(prices, slow_ma_period);
  const prevFastMA = calculateMA(prevPrices, fast_ma_period);
  const prevSlowMA = calculateMA(prevPrices, slow_ma_period);

  if (!currFastMA || !currSlowMA || !prevFastMA || !prevSlowMA) return { score: 0, direction: null };

  const latestPrice = prices[prices.length - 1];
  const prevPrice = prices[prices.length - 2];

  // Signal 1: MA Crossover
  const maCross = prevFastMA <= prevSlowMA && currFastMA > currSlowMA ? 'buy'
    : prevFastMA >= prevSlowMA && currFastMA < currSlowMA ? 'sell' : null;

  // Signal 2: Price above/below slow MA
  const priceTrend = latestPrice > currSlowMA ? 'buy' : latestPrice < currSlowMA ? 'sell' : null;

  // Signal 3: Fast MA slope (momentum)
  const fastSlope = currFastMA > prevFastMA ? 'buy' : currFastMA < prevFastMA ? 'sell' : null;

  // Signal 4: Price momentum (last bar direction)
  const priceMomentum = latestPrice > prevPrice ? 'buy' : latestPrice < prevPrice ? 'sell' : null;

  const signals = [maCross, priceTrend, fastSlope, priceMomentum];
  const buyCount = signals.filter(s => s === 'buy').length;
  const sellCount = signals.filter(s => s === 'sell').length;

  return {
    score: Math.max(buyCount, sellCount),
    direction: buyCount > sellCount ? 'buy' : sellCount > buyCount ? 'sell' : null,
    currFastMA, currSlowMA, signals,
  };
}

async function runSimpleStrategy(base44, symbol, prices, fast_ma_period, slow_ma_period, max_per_trade, openPositions, strategyTag, totalScore, consensus_threshold) {
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

  const scoreNote = totalScore !== null ? ` | Consensus: ${totalScore}/4` : '';

  if (goldenCross && !hasPosition) {
    // Gate: only buy if consensus score meets threshold (or no score available yet)
    if (totalScore !== null && totalScore < consensus_threshold) {
      return { symbol, action: 'skipped', reason: `Golden cross but consensus score ${totalScore}/4 below threshold ${consensus_threshold}`, strategy: strategyTag };
    }
    const qty = Math.floor(max_per_trade / latestPrice);
    if (qty < 1) return { symbol, message: 'Price too high for max_per_trade limit' };
    try {
      await placeOrder(symbol, 'buy', qty);
      const totalValue = qty * latestPrice;
      await base44.asServiceRole.entities.Trade.create({
        symbol, action: 'buy', quantity: qty, price: latestPrice, total_value: totalValue,
        status: 'executed', strategy: strategyTag,
        reason: `[${strategyTag}] Golden cross: fast MA (${currFastMA.toFixed(2)}) crossed above slow MA (${currSlowMA.toFixed(2)})${scoreNote}`,
        executed_at: new Date().toISOString(),
      });
      await base44.asServiceRole.entities.Position.create({
        symbol, quantity: qty, avg_entry_price: latestPrice, current_price: latestPrice,
        market_value: totalValue, unrealized_pl: 0, unrealized_pl_pct: 0,
      });
      return { symbol, action: 'buy', qty, price: latestPrice, strategy: strategyTag };
    } catch (e) {
      await base44.asServiceRole.entities.Trade.create({
        symbol, action: 'buy', quantity: 0, price: latestPrice, total_value: 0,
        status: 'failed', strategy: strategyTag, reason: e.message, executed_at: new Date().toISOString(),
      });
      return { symbol, error: e.message };
    }
  } else if (deathCross && hasPosition) {
    // Gate: only sell if consensus score is low enough (or no score available)
    if (totalScore !== null && totalScore > 1) {
      return { symbol, action: 'skipped', reason: `Death cross but consensus score ${totalScore}/4 still bullish — holding`, strategy: strategyTag };
    }
    const qty = parseFloat(existingPosition.qty);
    const avgEntry = parseFloat(existingPosition.avg_entry_price);
    try {
      await placeOrder(symbol, 'sell', qty);
      const totalValue = qty * latestPrice;
      const tradeResult = (latestPrice - avgEntry) * qty;
      await base44.asServiceRole.entities.Trade.create({
        symbol, action: 'sell', quantity: qty, price: latestPrice, total_value: totalValue,
        result: tradeResult, status: 'executed', strategy: strategyTag,
        reason: `[${strategyTag}] Death cross: fast MA (${currFastMA.toFixed(2)}) crossed below slow MA (${currSlowMA.toFixed(2)})${scoreNote}`,
        executed_at: new Date().toISOString(),
      });
      const positionRecords = await base44.asServiceRole.entities.Position.filter({ symbol });
      for (const pr of positionRecords) {
        await base44.asServiceRole.entities.Position.delete(pr.id);
      }
      return { symbol, action: 'sell', qty, price: latestPrice, result: tradeResult, strategy: strategyTag };
    } catch (e) {
      await base44.asServiceRole.entities.Trade.create({
        symbol, action: 'sell', quantity: qty, price: latestPrice, total_value: qty * latestPrice,
        status: 'failed', strategy: strategyTag, reason: e.message, executed_at: new Date().toISOString(),
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

async function runConsensusStrategy(base44, symbol, prices, fast_ma_period, slow_ma_period, max_per_trade, openPositions, strategyTag, totalScore, consensus_threshold) {
  const { score, direction, currFastMA, currSlowMA } = scoreConsensus(prices, fast_ma_period, slow_ma_period);

  if (score < 3 || !direction) {
    return { symbol, action: 'hold', message: `Consensus score ${score}/4 — no trade`, strategy: strategyTag };
  }

  const latestPrice = prices[prices.length - 1];
  const existingPosition = openPositions.find((p) => p.symbol === symbol);
  const hasPosition = existingPosition && parseFloat(existingPosition.qty) > 0;

  const scoreNote = totalScore !== null ? ` | ConsensusScore: ${totalScore}/4` : '';

  if (direction === 'buy' && !hasPosition) {
    if (totalScore !== null && totalScore < consensus_threshold) {
      return { symbol, action: 'skipped', reason: `Consensus strategy buy blocked — consensus score ${totalScore}/4 below threshold`, strategy: strategyTag };
    }
    const qty = Math.floor(max_per_trade / latestPrice);
    if (qty < 1) return { symbol, message: 'Price too high for max_per_trade limit' };
    try {
      await placeOrder(symbol, 'buy', qty);
      const totalValue = qty * latestPrice;
      await base44.asServiceRole.entities.Trade.create({
        symbol, action: 'buy', quantity: qty, price: latestPrice, total_value: totalValue,
        status: 'executed', strategy: strategyTag,
        reason: `[${strategyTag}] Consensus ${score}/4: buy signal${scoreNote}`,
        executed_at: new Date().toISOString(),
      });
      await base44.asServiceRole.entities.Position.create({
        symbol, quantity: qty, avg_entry_price: latestPrice, current_price: latestPrice,
        market_value: totalValue, unrealized_pl: 0, unrealized_pl_pct: 0,
      });
      return { symbol, action: 'buy', qty, price: latestPrice, score, strategy: strategyTag };
    } catch (e) {
      await base44.asServiceRole.entities.Trade.create({
        symbol, action: 'buy', quantity: 0, price: latestPrice, total_value: 0,
        status: 'failed', strategy: strategyTag, reason: e.message, executed_at: new Date().toISOString(),
      });
      return { symbol, error: e.message };
    }
  } else if (direction === 'sell' && hasPosition) {
    const qty = parseFloat(existingPosition.qty);
    const avgEntry = parseFloat(existingPosition.avg_entry_price);
    try {
      await placeOrder(symbol, 'sell', qty);
      const totalValue = qty * latestPrice;
      const tradeResult = (latestPrice - avgEntry) * qty;
      await base44.asServiceRole.entities.Trade.create({
        symbol, action: 'sell', quantity: qty, price: latestPrice, total_value: totalValue,
        result: tradeResult, status: 'executed', strategy: strategyTag,
        reason: `[${strategyTag}] Consensus ${score}/4: sell signal`,
        executed_at: new Date().toISOString(),
      });
      const positionRecords = await base44.asServiceRole.entities.Position.filter({ symbol });
      for (const pr of positionRecords) {
        await base44.asServiceRole.entities.Position.delete(pr.id);
      }
      return { symbol, action: 'sell', qty, price: latestPrice, result: tradeResult, score, strategy: strategyTag };
    } catch (e) {
      await base44.asServiceRole.entities.Trade.create({
        symbol, action: 'sell', quantity: qty, price: latestPrice, total_value: qty * latestPrice,
        status: 'failed', strategy: strategyTag, reason: e.message, executed_at: new Date().toISOString(),
      });
      return { symbol, error: e.message };
    }
  }

  return { symbol, action: 'hold', score, strategy: strategyTag };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!await isMarketOpen()) {
      return Response.json({ message: 'Market is not open, skipping.', ran_at: new Date().toISOString() });
    }

    const settingsList = await base44.asServiceRole.entities.StrategySettings.list('-created_date', 1);
    const settings = settingsList[0];

    if (!settings) return Response.json({ message: 'No strategy settings configured.' });
    if (!settings.bot_enabled) return Response.json({ message: 'Bot is disabled.' });

    const {
      watchlist = [],
      max_per_trade = 1000,
      daily_loss_limit = 500,
      fast_ma_period = 9,
      slow_ma_period = 21,
      strategy_mode = 'simple',
    } = settings;

    if (watchlist.length === 0) return Response.json({ message: 'Watchlist is empty.' });

    // Check daily loss limit
    const today = new Date().toISOString().split('T')[0];
    const allTodayTrades = await base44.asServiceRole.entities.Trade.list('-executed_at', 200);
    const todayTrades = allTodayTrades.filter((t) => t.executed_at && t.executed_at.startsWith(today));
    const dailyLoss = todayTrades.reduce((sum, t) => sum + (t.result || 0), 0);

    if (dailyLoss <= -daily_loss_limit) {
      return Response.json({
        message: `Daily loss limit of $${daily_loss_limit} hit. Bot stopped for today.`,
        daily_loss: dailyLoss,
      });
    }

    const consensus_threshold = settings.consensus_threshold ?? 3;

    const openPositions = await getPositions();

    // Load latest ConsensusScores for gating
    const allScores = await base44.asServiceRole.entities.ConsensusScore.list('-scored_at', 200);
    const consensusMap = {};
    for (const cs of allScores) {
      if (!consensusMap[cs.symbol]) consensusMap[cs.symbol] = cs;
    }

    const results = [];

    for (const symbol of watchlist) {
      const neededBars = slow_ma_period + 10;
      let prices;
      try {
        prices = await fetchBars(symbol, neededBars);
      } catch (e) {
        results.push({ symbol, error: e.message });
        continue;
      }

      if (prices.length < slow_ma_period + 1) {
        results.push({ symbol, message: 'Not enough price data' });
        continue;
      }

      const csScore = consensusMap[symbol];
      const totalScore = csScore?.total_score ?? null;

      if (strategy_mode === 'simple') {
        const r = await runSimpleStrategy(base44, symbol, prices, fast_ma_period, slow_ma_period, max_per_trade, openPositions, 'Simple', totalScore, consensus_threshold);
        results.push(r);
      } else if (strategy_mode === 'consensus') {
        const r = await runConsensusStrategy(base44, symbol, prices, fast_ma_period, slow_ma_period, max_per_trade, openPositions, 'Consensus', totalScore, consensus_threshold);
        results.push(r);
      } else if (strategy_mode === 'both') {
        const halfBudget = max_per_trade / 2;
        const rSimple = await runSimpleStrategy(base44, symbol, prices, fast_ma_period, slow_ma_period, halfBudget, openPositions, 'Simple', totalScore, consensus_threshold);
        const rConsensus = await runConsensusStrategy(base44, symbol, prices, fast_ma_period, slow_ma_period, halfBudget, openPositions, 'Consensus', totalScore, consensus_threshold);
        results.push(rSimple, rConsensus);
      }
    }

    return Response.json({ success: true, ran_at: new Date().toISOString(), strategy_mode, daily_loss: dailyLoss, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});