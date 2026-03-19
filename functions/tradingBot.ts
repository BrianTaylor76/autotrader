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

// Returns true if the AI veto should BLOCK this buy
function isAIVetoed(aiSignal, aiVetoEnabled) {
  if (!aiVetoEnabled || !aiSignal) return false;
  return aiSignal.overall_verdict === 'block';
}

// Simple MA crossover strategy gated by consensus score for BUY
async function runSimpleStrategy(base44, symbol, prices, fast_ma_period, slow_ma_period, max_per_trade, openPositions, strategyTag, consensusScore, consensus_threshold, aiSignal, aiVetoEnabled) {
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

  if (goldenCross && !hasPosition) {
    // Gate BUY on consensus score
    if (consensusScore !== null && consensusScore < consensus_threshold) {
      return { symbol, action: 'hold', message: `Golden cross but ${scoreLabel} below threshold (${consensus_threshold})`, strategy: strategyTag };
    }
    // Gate BUY on AI veto
    if (isAIVetoed(aiSignal, aiVetoEnabled)) {
      return {
        symbol, action: 'hold', strategy: strategyTag,
        message: `AI veto: ${aiSignal.claude_reasoning} / GPT: ${aiSignal.gpt_reasoning}`,
      };
    }
    const qty = Math.floor(max_per_trade / latestPrice);
    if (qty < 1) return { symbol, message: 'Price too high for max_per_trade limit' };
    try {
      await placeOrder(symbol, 'buy', qty);
      const totalValue = qty * latestPrice;
      const aiNote = aiSignal ? ` | AI: ${aiSignal.overall_verdict}` : '';
      await base44.asServiceRole.entities.Trade.create({
        symbol, action: 'buy', quantity: qty, price: latestPrice, total_value: totalValue,
        status: 'executed', strategy: strategyTag,
        reason: `[${strategyTag}] Golden cross: fast MA (${currFastMA.toFixed(2)}) crossed above slow MA (${currSlowMA.toFixed(2)}) | ${scoreLabel}${aiNote}`,
        executed_at: new Date().toISOString(),
      });
      await base44.asServiceRole.entities.Position.create({
        symbol, quantity: qty, avg_entry_price: latestPrice, current_price: latestPrice,
        market_value: totalValue, unrealized_pl: 0, unrealized_pl_pct: 0,
      });
      return { symbol, action: 'buy', qty, price: latestPrice, strategy: strategyTag, consensus_score: consensusScore };
    } catch (e) {
      await base44.asServiceRole.entities.Trade.create({
        symbol, action: 'buy', quantity: 0, price: latestPrice, total_value: 0,
        status: 'failed', strategy: strategyTag, reason: e.message, executed_at: new Date().toISOString(),
      });
      return { symbol, error: e.message };
    }
  } else if (deathCross && hasPosition) {
    // SELLS are NOT blocked by AI veto
    if (consensusScore !== null && consensusScore > 1) {
      return { symbol, action: 'hold', message: `Death cross but ${scoreLabel} still above 1 — holding`, strategy: strategyTag };
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
        reason: `[${strategyTag}] Death cross: fast MA (${currFastMA.toFixed(2)}) crossed below slow MA (${currSlowMA.toFixed(2)}) | ${scoreLabel}`,
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

// Consensus strategy: requires total_score >= threshold to BUY, <= 1 to SELL
async function runConsensusStrategy(base44, symbol, prices, fast_ma_period, slow_ma_period, max_per_trade, openPositions, strategyTag, consensusScore, consensus_threshold, aiSignal, aiVetoEnabled) {
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

  if (goldenCross && !hasPosition && score >= consensus_threshold) {
    // Gate BUY on AI veto
    if (isAIVetoed(aiSignal, aiVetoEnabled)) {
      return {
        symbol, action: 'hold', strategy: strategyTag,
        message: `AI veto: ${aiSignal.claude_reasoning} / GPT: ${aiSignal.gpt_reasoning}`,
      };
    }
    const qty = Math.floor(max_per_trade / latestPrice);
    if (qty < 1) return { symbol, message: 'Price too high for max_per_trade limit' };
    try {
      await placeOrder(symbol, 'buy', qty);
      const totalValue = qty * latestPrice;
      const aiNote = aiSignal ? ` | AI: ${aiSignal.overall_verdict}` : '';
      await base44.asServiceRole.entities.Trade.create({
        symbol, action: 'buy', quantity: qty, price: latestPrice, total_value: totalValue,
        status: 'executed', strategy: strategyTag,
        reason: `[${strategyTag}] Golden cross confirmed by ${scoreLabel} (threshold: ${consensus_threshold})${aiNote}`,
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
  } else if (deathCross && hasPosition && score <= 1) {
    // SELLS are NOT blocked by AI veto
    const qty = parseFloat(existingPosition.qty);
    const avgEntry = parseFloat(existingPosition.avg_entry_price);
    try {
      await placeOrder(symbol, 'sell', qty);
      const totalValue = qty * latestPrice;
      const tradeResult = (latestPrice - avgEntry) * qty;
      await base44.asServiceRole.entities.Trade.create({
        symbol, action: 'sell', quantity: qty, price: latestPrice, total_value: totalValue,
        result: tradeResult, status: 'executed', strategy: strategyTag,
        reason: `[${strategyTag}] Death cross confirmed by ${scoreLabel} (sell threshold: ≤1)`,
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

  return { symbol, action: 'hold', score, fast_ma: currFastMA.toFixed(2), slow_ma: currSlowMA.toFixed(2), strategy: strategyTag };
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
      consensus_threshold = 3,
      ai_veto_enabled = true,
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

    // Load latest ConsensusScores and AISignals in parallel
    const [allScores, allAISignals] = await Promise.all([
      base44.asServiceRole.entities.ConsensusScore.list('-scored_at', 200),
      base44.asServiceRole.entities.AISignal.list('-analyzed_at', 200),
    ]);

    const consensusMap = {};
    for (const cs of allScores) {
      if (!consensusMap[cs.symbol]) consensusMap[cs.symbol] = cs;
    }

    const aiSignalMap = {};
    for (const ai of allAISignals) {
      if (!aiSignalMap[ai.symbol]) aiSignalMap[ai.symbol] = ai;
    }

    const openPositions = await getPositions();
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

      const csScore = consensusMap[symbol]?.total_score ?? null;
      const aiSignal = aiSignalMap[symbol] || aiSignalMap[symbol?.toUpperCase()] || null;

      if (strategy_mode === 'simple') {
        const r = await runSimpleStrategy(base44, symbol, prices, fast_ma_period, slow_ma_period, max_per_trade, openPositions, 'Simple', csScore, consensus_threshold, aiSignal, ai_veto_enabled);
        results.push(r);
      } else if (strategy_mode === 'consensus') {
        const r = await runConsensusStrategy(base44, symbol, prices, fast_ma_period, slow_ma_period, max_per_trade, openPositions, 'Consensus', csScore, consensus_threshold, aiSignal, ai_veto_enabled);
        results.push(r);
      } else if (strategy_mode === 'both') {
        const halfBudget = max_per_trade / 2;
        const rSimple = await runSimpleStrategy(base44, symbol, prices, fast_ma_period, slow_ma_period, halfBudget, openPositions, 'Simple', csScore, consensus_threshold, aiSignal, ai_veto_enabled);
        const rConsensus = await runConsensusStrategy(base44, symbol, prices, fast_ma_period, slow_ma_period, halfBudget, openPositions, 'Consensus', csScore, consensus_threshold, aiSignal, ai_veto_enabled);
        results.push(rSimple, rConsensus);
      }
    }

    return Response.json({ success: true, ran_at: new Date().toISOString(), strategy_mode, daily_loss: dailyLoss, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});