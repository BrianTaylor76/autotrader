import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const ALPACA_KEY = Deno.env.get("ALPACA_API_KEY");
const ALPACA_SECRET = Deno.env.get("ALPACA_API_SECRET");

const HEADERS = {
  "APCA-API-KEY-ID": ALPACA_KEY,
  "APCA-API-SECRET-KEY": ALPACA_SECRET,
};

async function alpacaGet(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error(`Alpaca error ${res.status}: ${await res.text()}`);
  return res.json();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { action, symbols, symbol, timeframe, start, end } = await req.json();

    if (action === "snapshots") {
      // Bulk stock snapshots - up to 100 symbols
      const stockSymbols = symbols.filter(s => !s.includes("/"));
      const cryptoSymbols = symbols.filter(s => s.includes("/"));
      const results = {};

      if (stockSymbols.length > 0) {
        const data = await alpacaGet(
          `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${stockSymbols.join(",")}&feed=iex`
        );
        for (const [sym, snap] of Object.entries(data)) {
          results[sym] = {
            price: snap.latestTrade?.p || snap.minuteBar?.c || 0,
            change_pct: snap.dailyBar && snap.prevDailyBar
              ? ((snap.dailyBar.c - snap.prevDailyBar.c) / snap.prevDailyBar.c) * 100
              : 0,
            volume: snap.dailyBar?.v || 0,
            vwap: snap.dailyBar?.vw || 0,
            high: snap.dailyBar?.h || 0,
            low: snap.dailyBar?.l || 0,
          };
        }
      }

      if (cryptoSymbols.length > 0) {
        const cryptoData = await alpacaGet(
          `https://data.alpaca.markets/v1beta3/crypto/us/snapshots?symbols=${cryptoSymbols.join(",")}`
        );
        for (const [sym, snap] of Object.entries(cryptoData.snapshots || {})) {
          results[sym] = {
            price: snap.latestTrade?.p || snap.minuteBar?.c || 0,
            change_pct: snap.dailyBar && snap.prevDailyBar
              ? ((snap.dailyBar.c - snap.prevDailyBar.c) / snap.prevDailyBar.c) * 100
              : 0,
            volume: snap.dailyBar?.v || 0,
          };
        }
      }

      return Response.json({ snapshots: results });
    }

    if (action === "hot_movers") {
      const data = await alpacaGet(
        `https://data.alpaca.markets/v1beta1/screener/stocks/most_actives?by=volume&top=10`
      );
      const movers = data.most_actives || [];
      // Enrich with snapshots
      const syms = movers.map(m => m.symbol).join(",");
      let snaps = {};
      if (syms) {
        const snapData = await alpacaGet(`https://data.alpaca.markets/v2/stocks/snapshots?symbols=${syms}&feed=iex`);
        snaps = snapData;
      }
      const enriched = movers.map(m => {
        const snap = snaps[m.symbol] || {};
        const price = snap.latestTrade?.p || snap.minuteBar?.c || 0;
        const changePct = snap.dailyBar && snap.prevDailyBar
          ? ((snap.dailyBar.c - snap.prevDailyBar.c) / snap.prevDailyBar.c) * 100
          : 0;
        const vol = snap.dailyBar?.v || m.volume || 0;
        // avg volume approx from 1m bar * 390
        const avgVol = snap.minuteBar?.v ? snap.minuteBar.v * 390 : vol / 2;
        return {
          symbol: m.symbol,
          price,
          change_pct: changePct,
          volume: vol,
          avg_volume: avgVol,
          vol_ratio: avgVol > 0 ? vol / avgVol : 1,
        };
      });
      return Response.json({ movers: enriched });
    }

    if (action === "ticker_bar") {
      const stockSyms = ["SPY","QQQ","DIA","IWM"];
      const cryptoSyms = ["BTC/USD","ETH/USD"];
      const [stockData, cryptoData] = await Promise.all([
        alpacaGet(`https://data.alpaca.markets/v2/stocks/snapshots?symbols=${stockSyms.join(",")}&feed=iex`),
        alpacaGet(`https://data.alpaca.markets/v1beta3/crypto/us/snapshots?symbols=${cryptoSyms.join(",")}`),
      ]);
      const results = {};
      for (const [sym, snap] of Object.entries(stockData)) {
        results[sym] = {
          price: snap.latestTrade?.p || snap.minuteBar?.c || 0,
          change_pct: snap.dailyBar && snap.prevDailyBar
            ? ((snap.dailyBar.c - snap.prevDailyBar.c) / snap.prevDailyBar.c) * 100
            : 0,
        };
      }
      for (const [sym, snap] of Object.entries(cryptoData.snapshots || {})) {
        results[sym] = {
          price: snap.latestTrade?.p || snap.minuteBar?.c || 0,
          change_pct: snap.dailyBar && snap.prevDailyBar
            ? ((snap.dailyBar.c - snap.prevDailyBar.c) / snap.prevDailyBar.c) * 100
            : 0,
        };
      }
      return Response.json({ ticker: results });
    }

    if (action === "bars") {
      // Historical bars for candlestick chart
      const isCrypto = symbol.includes("/");
      let url;
      if (isCrypto) {
        url = `https://data.alpaca.markets/v1beta3/crypto/us/bars?symbols=${symbol}&timeframe=1Day&start=${start}&end=${end}&limit=200`;
      } else {
        url = `https://data.alpaca.markets/v2/stocks/${symbol}/bars?timeframe=1Day&start=${start}&end=${end}&limit=200&feed=iex`;
      }
      const data = await alpacaGet(url);
      const bars = isCrypto
        ? (data.bars?.[symbol] || [])
        : (data.bars || []);
      return Response.json({ bars });
    }

    if (action === "asset") {
      const isCrypto = symbol.includes("/");
      if (isCrypto) return Response.json({ fractionable: true, name: symbol });
      const data = await alpacaGet(`https://paper-api.alpaca.markets/v2/assets/${symbol}`);
      return Response.json({ fractionable: data.fractionable || false, name: data.name || symbol, exchange: data.exchange || "" });
    }

    if (action === "paper_trade") {
      const { qty, side, type: orderType } = await req.json().catch(() => ({}));
      // Submit paper trade to Alpaca paper API
      const res = await fetch("https://paper-api.alpaca.markets/v2/orders", {
        method: "POST",
        headers: { ...HEADERS, "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          qty,
          side,
          type: "market",
          time_in_force: "day",
        }),
      });
      const order = await res.json();
      return Response.json({ order });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});