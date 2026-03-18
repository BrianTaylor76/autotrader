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

function isMarketHours() {
  const now = new Date();
  const etOptions = { timeZone: 'America/New_York' };
  const etTime = new Date(now.toLocaleString('en-US', etOptions));
  const day = etTime.getDay(); // 0=Sun, 6=Sat
  const hours = etTime.getHours();
  const minutes = etTime.getMinutes();
  const totalMinutes = hours * 60 + minutes;
  const open = 9 * 60 + 30;  // 9:30 AM
  const close = 16 * 60;     // 4:00 PM
  if (day === 0 || day === 6) return false;
  return totalMinutes >= open && totalMinutes < close;
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
  return (data.bars || []).map((b) => b.c); // close prices
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

async function getLatestPrice(symbol) {
  const url = `${ALPACA_DATA_URL}/v2/stocks/${symbol}/bars?timeframe=1Min&limit=1&feed=iex`;
  const res = await fetch(url, { headers: alpacaHeaders });
  if (!res.ok) return null;
  const data = await res.json();
  const bars = data.bars || [];
  return bars.length > 0 ? bars[bars.length - 1].c : null;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!isMarketHours()) {
      return Response.json({ message: 'Outside market hours, skipping.', ran_at: new Date().toISOString() });
    }

    // Fetch settings
    const settingsList = await base44.asServiceRole.entities.StrategySettings.list('-created_date', 1);
    const settings = settingsList[0];

    if (!settings) {
      return Response.json({ message: 'No strategy settings configured.' });
    }
    if (!settings.bot_enabled) {
      return Response.json({ message: 'Bot is disabled.' });
    }

    const { watchlist = [], max_per_trade = 1000, daily_loss_limit = 500, fast_ma_period = 9, slow_ma_period = 21 } = settings;

    if (watchlist.length === 0) {
      return Response.json({ message: 'Watchlist is empty.' });
    }

    // Check daily loss limit
    const today = new Date().toISOString().split('T')[0];
    const allTodayTrades = await base44.asServiceRole.entities.Trade.list('-executed_at', 200);
    const todayTrades = allTodayTrades.filter((t) => t.executed_at && t.executed_at.startsWith(today));
    const dailyLoss = todayTrades.reduce((sum, t) => sum + (t.result || 0), 0);

    if (dailyLoss <= -daily_loss_limit) {
      return Response.json({ message: `Daily loss limit of $${daily_loss_limit} hit. Bot stopped for today.`, daily_loss: dailyLoss });
    }

    const openPositions = await getPositions();
    const results = [];

    for (const symbol of watchlist) {
      const neededBars = slow_ma_period + 2;

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

      // Current and previous MAs
      const prevPrices = prices.slice(0, -1);
      const currFastMA = calculateMA(prices, fast_ma_period);
      const currSlowMA = calculateMA(prices, slow_ma_period);
      const prevFastMA = calculateMA(prevPrices, fast_ma_period);
      const prevSlowMA = calculateMA(prevPrices, slow_ma_period);

      if (!currFastMA || !currSlowMA || !prevFastMA || !prevSlowMA) {
        results.push({ symbol, message: 'Could not calculate MAs' });
        continue;
      }

      const latestPrice = prices[prices.length - 1];
      const existingPosition = openPositions.find((p) => p.symbol === symbol);
      const hasPosition = existingPosition && parseFloat(existingPosition.qty) > 0;

      // Golden cross: fast MA crosses above slow MA → BUY
      const goldenCross = prevFastMA <= prevSlowMA && currFastMA > currSlowMA;
      // Death cross: fast MA crosses below slow MA → SELL
      const deathCross = prevFastMA >= prevSlowMA && currFastMA < currSlowMA;

      if (goldenCross && !hasPosition) {
        const qty = Math.floor(max_per_trade / latestPrice);
        if (qty < 1) {
          results.push({ symbol, message: 'Price too high for max_per_trade limit' });
          continue;
        }
        try {
          await placeOrder(symbol, 'buy', qty);
          const totalValue = qty * latestPrice;
          await base44.asServiceRole.entities.Trade.create({
            symbol,
            action: 'buy',
            quantity: qty,
            price: latestPrice,
            total_value: totalValue,
            status: 'executed',
            reason: `Golden cross: fast MA (${currFastMA.toFixed(2)}) crossed above slow MA (${currSlowMA.toFixed(2)})`,
            executed_at: new Date().toISOString(),
          });
          // Sync position record
          await base44.asServiceRole.entities.Position.create({
            symbol,
            quantity: qty,
            avg_entry_price: latestPrice,
            current_price: latestPrice,
            market_value: totalValue,
            unrealized_pl: 0,
            unrealized_pl_pct: 0,
          });
          results.push({ symbol, action: 'buy', qty, price: latestPrice });
        } catch (e) {
          await base44.asServiceRole.entities.Trade.create({
            symbol, action: 'buy', quantity: 0, price: latestPrice, total_value: 0,
            status: 'failed', reason: e.message, executed_at: new Date().toISOString(),
          });
          results.push({ symbol, error: e.message });
        }
      } else if (deathCross && hasPosition) {
        const qty = parseFloat(existingPosition.qty);
        const avgEntry = parseFloat(existingPosition.avg_entry_price);
        try {
          await placeOrder(symbol, 'sell', qty);
          const totalValue = qty * latestPrice;
          const tradeResult = (latestPrice - avgEntry) * qty;
          await base44.asServiceRole.entities.Trade.create({
            symbol,
            action: 'sell',
            quantity: qty,
            price: latestPrice,
            total_value: totalValue,
            result: tradeResult,
            status: 'executed',
            reason: `Death cross: fast MA (${currFastMA.toFixed(2)}) crossed below slow MA (${currSlowMA.toFixed(2)})`,
            executed_at: new Date().toISOString(),
          });
          // Remove position record
          const positionRecords = await base44.asServiceRole.entities.Position.filter({ symbol });
          for (const pr of positionRecords) {
            await base44.asServiceRole.entities.Position.delete(pr.id);
          }
          results.push({ symbol, action: 'sell', qty, price: latestPrice, result: tradeResult });
        } catch (e) {
          await base44.asServiceRole.entities.Trade.create({
            symbol, action: 'sell', quantity: qty, price: latestPrice, total_value: qty * latestPrice,
            status: 'failed', reason: e.message, executed_at: new Date().toISOString(),
          });
          results.push({ symbol, error: e.message });
        }
      } else {
        // Update position market value if holding
        if (hasPosition) {
          const positionRecords = await base44.asServiceRole.entities.Position.filter({ symbol });
          for (const pr of positionRecords) {
            const qty = pr.quantity;
            const marketValue = qty * latestPrice;
            const unrealizedPL = (latestPrice - pr.avg_entry_price) * qty;
            const unrealizedPLPct = ((latestPrice - pr.avg_entry_price) / pr.avg_entry_price) * 100;
            await base44.asServiceRole.entities.Position.update(pr.id, {
              current_price: latestPrice,
              market_value: marketValue,
              unrealized_pl: unrealizedPL,
              unrealized_pl_pct: unrealizedPLPct,
            });
          }
        }
        results.push({ symbol, action: 'hold', fast_ma: currFastMA.toFixed(2), slow_ma: currSlowMA.toFixed(2) });
      }
    }

    return Response.json({ success: true, ran_at: new Date().toISOString(), daily_loss: dailyLoss, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});