import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const ALPACA_KEY = Deno.env.get("ALPACA_API_KEY");
const ALPACA_SECRET = Deno.env.get("ALPACA_API_SECRET");

const HEADERS = {
  "APCA-API-KEY-ID": ALPACA_KEY,
  "APCA-API-SECRET-KEY": ALPACA_SECRET,
};

async function alpacaGet(url) {
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Alpaca ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { action, symbols, symbol, start, end } = body;

    // ── TICKER BAR ─────────────────────────────────────────────────────────────
    if (action === "ticker_bar") {
      const stockSyms = ["SPY","QQQ","DIA","IWM"];
      const cryptoSyms = ["BTCUSD","ETHUSD"];

      const results = {};

      // Fetch stock snapshots
      try {
        const data = await alpacaGet(
          `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${stockSyms.join(",")}&feed=iex`
        );
        for (const [sym, snap] of Object.entries(data)) {
          const prev = snap.prevDailyBar?.c || 0;
          const cur = snap.dailyBar?.c || snap.latestTrade?.p || 0;
          results[sym] = {
            price: snap.latestTrade?.p || cur,
            change_pct: prev ? ((cur - prev) / prev) * 100 : 0,
          };
        }
      } catch (e) {
        console.error("Stock ticker error:", e.message);
      }

      // Fetch crypto snapshots
      try {
        const cryptoData = await alpacaGet(
          `https://data.alpaca.markets/v1beta3/crypto/us/snapshots?symbols=${cryptoSyms.join(",")}`
        );
        for (const [sym, snap] of Object.entries(cryptoData.snapshots || {})) {
          const prev = snap.prevDailyBar?.c || 0;
          const cur = snap.dailyBar?.c || snap.latestTrade?.p || 0;
          // Map BTCUSD -> BTC/USD for display
          const displayKey = sym.replace("USD", "/USD").replace("//", "/");
          results[displayKey] = {
            price: snap.latestTrade?.p || cur,
            change_pct: prev ? ((cur - prev) / prev) * 100 : 0,
          };
        }
      } catch (e) {
        console.error("Crypto ticker error:", e.message);
      }

      return Response.json({ ticker: results });
    }

    // ── SNAPSHOTS (batch) ───────────────────────────────────────────────────────
    if (action === "snapshots") {
      const stockSymbols = (symbols || []).filter(s => !s.includes("USD"));
      const cryptoSymbols = (symbols || []).filter(s => s.includes("USD"));
      const results = {};

      if (stockSymbols.length > 0) {
        try {
          const data = await alpacaGet(
            `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${stockSymbols.join(",")}&feed=iex`
          );
          for (const [sym, snap] of Object.entries(data)) {
            const prev = snap.prevDailyBar?.c || 0;
            const cur = snap.dailyBar?.c || snap.latestTrade?.p || 0;
            results[sym] = {
              price: snap.latestTrade?.p || cur,
              change_pct: prev ? ((cur - prev) / prev) * 100 : 0,
              volume: snap.dailyBar?.v || 0,
              prev_volume: snap.prevDailyBar?.v || 0,
              vol_ratio: snap.prevDailyBar?.v ? (snap.dailyBar?.v || 0) / snap.prevDailyBar.v : 1,
            };
          }
        } catch (e) {
          console.error("Snapshots error:", e.message);
        }
      }

      if (cryptoSymbols.length > 0) {
        try {
          const cryptoData = await alpacaGet(
            `https://data.alpaca.markets/v1beta3/crypto/us/snapshots?symbols=${cryptoSymbols.join(",")}`
          );
          for (const [sym, snap] of Object.entries(cryptoData.snapshots || {})) {
            const prev = snap.prevDailyBar?.c || 0;
            const cur = snap.dailyBar?.c || snap.latestTrade?.p || 0;
            results[sym] = {
              price: snap.latestTrade?.p || cur,
              change_pct: prev ? ((cur - prev) / prev) * 100 : 0,
              volume: snap.dailyBar?.v || 0,
              vol_ratio: snap.prevDailyBar?.v ? (snap.dailyBar?.v || 0) / snap.prevDailyBar.v : 1,
            };
          }
        } catch (e) {
          console.error("Crypto snapshots error:", e.message);
        }
      }

      return Response.json({ snapshots: results });
    }

    // ── HOT MOVERS ──────────────────────────────────────────────────────────────
    if (action === "hot_movers") {
      const HOT_SYMBOLS = ["AAPL","MSFT","NVDA","TSLA","AMD","META","GOOGL","AMZN","SPY","QQQ"];
      try {
        const data = await alpacaGet(
          `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${HOT_SYMBOLS.join(",")}&feed=iex`
        );
        const movers = HOT_SYMBOLS.map(sym => {
          const snap = data[sym];
          if (!snap) return { symbol: sym, price: 0, change_pct: 0, volume: 0, vol_ratio: 1 };
          const prev = snap.prevDailyBar?.c || 0;
          const cur = snap.dailyBar?.c || snap.latestTrade?.p || 0;
          const vol = snap.dailyBar?.v || 0;
          const prevVol = snap.prevDailyBar?.v || 1;
          return {
            symbol: sym,
            price: snap.latestTrade?.p || cur,
            change_pct: prev ? ((cur - prev) / prev) * 100 : 0,
            volume: vol,
            avg_volume: prevVol,
            vol_ratio: prevVol > 0 ? vol / prevVol : 1,
          };
        });
        return Response.json({ movers });
      } catch (e) {
        return Response.json({ movers: HOT_SYMBOLS.map(s => ({ symbol: s, price: 0, change_pct: 0, volume: 0, vol_ratio: 1 })) });
      }
    }

    // ── BARS (candlestick chart) ─────────────────────────────────────────────────
    if (action === "bars") {
      const isCrypto = symbol && (symbol.includes("USD") || symbol.includes("/"));
      try {
        let bars = [];
        if (isCrypto) {
          const cleanSym = symbol.replace("/","");
          const data = await alpacaGet(
            `https://data.alpaca.markets/v1beta3/crypto/us/bars?symbols=${cleanSym}&timeframe=1Day&start=${start}&end=${end}&limit=180`
          );
          bars = data.bars?.[cleanSym] || [];
        } else {
          const data = await alpacaGet(
            `https://data.alpaca.markets/v2/stocks/${symbol}/bars?timeframe=1Day&start=${start}&end=${end}&limit=180&feed=iex&adjustment=raw`
          );
          bars = data.bars || [];
        }
        return Response.json({ bars });
      } catch (e) {
        return Response.json({ bars: [], error: e.message });
      }
    }

    // ── ASSET INFO ───────────────────────────────────────────────────────────────
    if (action === "asset") {
      if (!symbol) return Response.json({ fractionable: false });
      if (symbol.includes("USD") || symbol.includes("/")) {
        return Response.json({ fractionable: true, name: symbol, exchange: "Crypto" });
      }
      try {
        const data = await alpacaGet(`https://paper-api.alpaca.markets/v2/assets/${symbol}`);
        return Response.json({ fractionable: data.fractionable || false, name: data.name || symbol, exchange: data.exchange || "" });
      } catch (e) {
        return Response.json({ fractionable: false, name: symbol, exchange: "" });
      }
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});