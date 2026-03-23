import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const ALPACA_KEY = Deno.env.get("ALPACA_API_KEY");
const ALPACA_SECRET = Deno.env.get("ALPACA_API_SECRET");
const COVID_START = new Date("2020-02-15");
const COVID_END = new Date("2020-04-30");
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
      timeframe: "1Day",
      start: startDate,
      end: endDate,
      limit: "1000",
      feed: "iex",
    });
    if (pageToken) params.set("page_token", pageToken);
    const res = await fetch(`${baseUrl}?${params}`, {
      headers: {
        "APCA-API-KEY-ID": ALPACA_KEY,
        "APCA-API-SECRET-KEY": ALPACA_SECRET,
      },
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
  const dates = bars.map(b => b.t.split("T")[0]);
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

    // Peak/drawdown tracking
    if (portfolioValue > peakValue) peakValue = portfolioValue;
    const drawdown = (peakValue - portfolioValue) / peakValue * 100;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;

    // Detect crossover
    if (prevFastAboveSlow !== null && fastAboveSlow !== prevFastAboveSlow) {
      const isGoldenCross = fastAboveSlow;
      const covid = isCovidPeriod(dates[i]);
      const covidNote = covid ? " ⚠️ COVID-19 market crash — extreme volatility, results during this period are not representative of normal market conditions" : "";

      if (isGoldenCross && cash > 0) {
        // BUY signal
        let shouldBuy = true;
        let reason = `Golden cross: fast MA (${fastMA.toFixed(2)}) crossed above slow MA (${slowMA.toFixed(2)})`;

        if (strategyType === "consensus") {
          if (ma200 === null) {
            shouldBuy = false;
          } else if (closes[i] < ma200) {
            shouldBuy = false;
            reason += " — below 200d MA, consensus score 1/3, skipped";
          } else {
            reason += " — above 200d MA, consensus score 2/3, confirmed";
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
              strategy: strategyType,
              symbol: bars[0]?.S || "?",
              action: "buy",
              date: dates[i],
              price: closes[i],
              quantity: qty,
              value,
              result_dollars: null,
              result_pct: null,
              cumulative_portfolio_value: cash + shares * closes[i],
              ma_fast: fastMA,
              ma_slow: slowMA,
              signal_reason: reason + covidNote,
              is_covid_period: covid,
            });
          }
        }
      } else if (!isGoldenCross && shares > 0) {
        // SELL signal
        const value = shares * closes[i];
        const resultDollars = (closes[i] - entryPrice) * shares;
        const resultPct = (closes[i] - entryPrice) / entryPrice * 100;
        cash += value;
        const covid = isCovidPeriod(dates[i]);
        const covidNote = covid ? " ⚠️ COVID-19 market crash — extreme volatility, results during this period are not representative of normal market conditions" : "";
        trades.push({
          strategy: strategyType,
          symbol: bars[0]?.S || "?",
          action: "sell",
          date: dates[i],
          price: closes[i],
          quantity: shares,
          value,
          result_dollars: resultDollars,
          result_pct: resultPct,
          cumulative_portfolio_value: cash,
          ma_fast: fastMA,
          ma_slow: slowMA,
          signal_reason: `Death cross: fast MA (${fastMA.toFixed(2)}) crossed below slow MA (${slowMA.toFixed(2)})` + covidNote,
          is_covid_period: covid,
        });
        shares = 0;
        entryPrice = 0;
      }
    }

    prevFastAboveSlow = fastAboveSlow;
    dailyValues.push({ date: dates[i], value: cash + shares * closes[i] });
  }

  // Liquidate at end if holding
  if (shares > 0) {
    const lastClose = closes[closes.length - 1];
    const lastDate = dates[dates.length - 1];
    const value = shares * lastClose;
    const resultDollars = (lastClose - entryPrice) * shares;
    const resultPct = (lastClose - entryPrice) / entryPrice * 100;
    cash += value;
    trades.push({
      strategy: strategyType,
      symbol: bars[0]?.S || "?",
      action: "sell",
      date: lastDate,
      price: lastClose,
      quantity: shares,
      value,
      result_dollars: resultDollars,
      result_pct: resultPct,
      cumulative_portfolio_value: cash,
      ma_fast: calcMA(closes, fastPeriod, closes.length - 1),
      ma_slow: calcMA(closes, slowPeriod, closes.length - 1),
      signal_reason: "Period end — position liquidated",
      is_covid_period: isCovidPeriod(lastDate),
    });
    shares = 0;
  }

  const finalValue = cash;

  // Compute sell-only stats
  const sellTrades = trades.filter(t => t.action === "sell" && t.result_dollars !== null);
  const winning = sellTrades.filter(t => t.result_dollars > 0);
  const losing = sellTrades.filter(t => t.result_dollars <= 0);
  const winRate = sellTrades.length > 0 ? (winning.length / sellTrades.length) * 100 : 0;
  const avgGain = winning.length > 0 ? winning.reduce((s, t) => s + t.result_pct, 0) / winning.length : 0;
  const avgLoss = losing.length > 0 ? losing.reduce((s, t) => s + t.result_pct, 0) / losing.length : 0;

  // Sharpe ratio from daily returns
  const vals = dailyValues.map(d => d.value);
  const dailyReturns = [];
  for (let i = 1; i < vals.length; i++) {
    dailyReturns.push((vals[i] - vals[i - 1]) / vals[i - 1]);
  }
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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { symbol, start_date, end_date, fast_ma, slow_ma, initial_capital, strategies } = await req.json();

    if (!symbol || !start_date || !end_date) {
      return Response.json({ error: "Missing required parameters" }, { status: 400 });
    }

    const fastPeriod = fast_ma || 5;
    const slowPeriod = slow_ma || 13;
    const capital = initial_capital || 10000;
    const stratList = strategies || ["simple", "consensus"];

    // Create run record
    const runId = crypto.randomUUID();
    const run = await base44.entities.BacktestRun.create({
      run_id: runId,
      strategy: stratList.length === 2 ? "both" : stratList[0],
      symbol: symbol.toUpperCase(),
      start_date,
      end_date,
      fast_ma: fastPeriod,
      slow_ma: slowPeriod,
      initial_capital: capital,
      status: "running",
      created_at: new Date().toISOString(),
    });

    // Fetch bars - need extra history for 200-day MA
    const extendedStart = new Date(start_date);
    extendedStart.setFullYear(extendedStart.getFullYear() - 1);
    const bars = await fetchAllBars(symbol.toUpperCase(), extendedStart.toISOString().split("T")[0], end_date);

    if (bars.length < slowPeriod + 5) {
      await base44.entities.BacktestRun.update(run.id, { status: "failed", error_message: "Not enough historical data" });
      return Response.json({ error: "Not enough historical data" }, { status: 400 });
    }

    // Filter bars to requested range for results (but use full for MA calc)
    const startDateObj = new Date(start_date);
    const barsFiltered = bars; // use all for MA warmup

    let simpleResult = null;
    let consensusResult = null;
    const allTrades = [];

    if (stratList.includes("simple")) {
      simpleResult = simulateStrategy(barsFiltered, fastPeriod, slowPeriod, capital, "simple");
      allTrades.push(...simpleResult.trades.map(t => ({ ...t, run_id: run.id })));
    }

    if (stratList.includes("consensus")) {
      consensusResult = simulateStrategy(barsFiltered, fastPeriod, slowPeriod, capital, "consensus");
      allTrades.push(...consensusResult.trades.map(t => ({ ...t, run_id: run.id })));
    }

    // Save trades in batches
    const BATCH = 50;
    for (let i = 0; i < allTrades.length; i += BATCH) {
      await base44.entities.BacktestTrade.bulkCreate(allTrades.slice(i, i + BATCH));
    }

    // Update run with stats
    const updatePayload = { status: "complete" };
    if (simpleResult) {
      const s = simpleResult.stats;
      Object.assign(updatePayload, {
        simple_total_return_pct: s.total_return_pct,
        simple_total_return_dollars: s.total_return_dollars,
        simple_win_rate: s.win_rate,
        simple_total_trades: s.total_trades,
        simple_winning_trades: s.winning_trades,
        simple_losing_trades: s.losing_trades,
        simple_avg_gain: s.avg_gain,
        simple_avg_loss: s.avg_loss,
        simple_max_drawdown: s.max_drawdown,
        simple_sharpe_ratio: s.sharpe_ratio,
        simple_final_value: s.final_value,
      });
    }
    if (consensusResult) {
      const s = consensusResult.stats;
      Object.assign(updatePayload, {
        consensus_total_return_pct: s.total_return_pct,
        consensus_total_return_dollars: s.total_return_dollars,
        consensus_win_rate: s.win_rate,
        consensus_total_trades: s.total_trades,
        consensus_winning_trades: s.winning_trades,
        consensus_losing_trades: s.losing_trades,
        consensus_avg_gain: s.avg_gain,
        consensus_avg_loss: s.avg_loss,
        consensus_max_drawdown: s.max_drawdown,
        consensus_sharpe_ratio: s.sharpe_ratio,
        consensus_final_value: s.final_value,
      });
    }

    await base44.entities.BacktestRun.update(run.id, updatePayload);

    return Response.json({
      run_id: run.id,
      simple: simpleResult ? { stats: simpleResult.stats, dailyValues: simpleResult.dailyValues } : null,
      consensus: consensusResult ? { stats: consensusResult.stats, dailyValues: consensusResult.dailyValues } : null,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});