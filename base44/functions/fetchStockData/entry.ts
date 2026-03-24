import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const ALPACA_KEY = Deno.env.get("ALPACA_API_KEY");
const ALPACA_SECRET = Deno.env.get("ALPACA_API_SECRET");

const HEADERS = {
  "APCA-API-KEY-ID": ALPACA_KEY,
  "APCA-API-SECRET-KEY": ALPACA_SECRET,
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function alpacaGet(url, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    if (res.status === 429) {
      if (attempt < retries) {
        await sleep(5000 * Math.pow(2, attempt));
        continue;
      }
      throw new Error("Rate limited — please try again in a moment");
    }
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Data unavailable (${res.status})`);
    }
    return res.json();
  }
}

function toCryptoSlash(sym) {
  return sym.includes("/") ? sym : sym.replace(/^([A-Z]+)(USD)$/, "$1/USD");
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { action, symbols, symbol, start, end } = body;

    // ── TICKER BAR ──────────────────────────────────────────────────────────────
    if (action === "ticker_bar") {
      const stockSyms = ["SPY","QQQ","DIA","IWM"];
      const results = {};

      // Stock snapshots
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

      // Crypto — try latest trades first, fall back to bars
      try {
        const cryptoRes = await alpacaGet(
          `https://data.alpaca.markets/v1beta3/crypto/us/latest/trades?symbols=BTCUSD,ETHUSD`
        );
        const trades = cryptoRes.trades || {};
        for (const [sym, trade] of Object.entries(trades)) {
          results[sym] = { price: trade.p || 0, change_pct: 0 };
        }
        // Get daily bars for change_pct
        try {
          const today = new Date().toISOString().split("T")[0];
          const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];
          const barsData = await alpacaGet(
            `https://data.alpaca.markets/v1beta3/crypto/us/bars?symbols=BTCUSD,ETHUSD&timeframe=1Day&start=${yesterday}&end=${today}&limit=2`
          );
          const bars = barsData.bars || {};
          for (const [sym, symBars] of Object.entries(bars)) {
            if (symBars.length >= 2) {
              const prev = symBars[symBars.length - 2].c;
              const cur = symBars[symBars.length - 1].c;
              if (results[sym]) results[sym].change_pct = prev ? ((cur - prev) / prev) * 100 : 0;
            }
          }
        } catch (e) {
          console.error("Crypto change_pct error:", e.message);
        }
      } catch (e) {
        console.error("Crypto latest trades error:", e.message);
        // Fallback: 1-min bars
        try {
          const fallback = await alpacaGet(
            `https://data.alpaca.markets/v1beta3/crypto/us/bars?symbols=BTCUSD,ETHUSD&timeframe=1Min&limit=1`
          );
          const bars = fallback.bars || {};
          for (const [sym, symBars] of Object.entries(bars)) {
            if (symBars.length > 0) {
              results[sym] = { price: symBars[symBars.length - 1].c, change_pct: 0 };
            }
          }
        } catch (e2) {
          console.error("Crypto fallback error:", e2.message);
        }
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
        // Convert to slash format: ETHUSD → ETH/USD
        const slashSymbols = cryptoSymbols.map(toCryptoSlash);
        try {
          const cryptoData = await alpacaGet(
            `https://data.alpaca.markets/v2/crypto/us/snapshots?symbols=${slashSymbols.map(encodeURIComponent).join(",")}`
          );
          const snaps = cryptoData.snapshots || {};
          cryptoSymbols.forEach((origSym, idx) => {
            const slashSym = slashSymbols[idx];
            const snap = snaps[slashSym];
            if (!snap) return;
            const prev = snap.prevDailyBar?.c || 0;
            const cur = snap.dailyBar?.c || snap.latestTrade?.p || 0;
            results[origSym] = {
              price: snap.latestTrade?.p || cur,
              change_pct: prev ? ((cur - prev) / prev) * 100 : 0,
              volume: snap.dailyBar?.v || 0,
              vol_ratio: snap.prevDailyBar?.v ? (snap.dailyBar?.v || 0) / snap.prevDailyBar.v : 1,
              is_fractional: true,
            };
          });
        } catch (e) {
          // Fallback: fetch latest trades for each crypto symbol individually
          for (let i = 0; i < cryptoSymbols.length; i++) {
            try {
              const slashSym = slashSymbols[i];
              const tradesData = await alpacaGet(
                `https://data.alpaca.markets/v2/crypto/us/latest/trades?symbols=${encodeURIComponent(slashSym)}`
              );
              const trade = tradesData.trades?.[slashSym];
              if (trade) {
                results[cryptoSymbols[i]] = { price: trade.p, change_pct: 0, volume: 0, vol_ratio: 1, is_fractional: true };
              }
            } catch (e2) {
              console.error("Crypto fallback error:", e2.message);
            }
            if (i < cryptoSymbols.length - 1) await sleep(300);
          }
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
          // Normalize to slash format: AVAXUSD → AVAX/USD
          const slashSym = symbol.includes("/") ? symbol : symbol.replace(/^([A-Z]+)(USD)$/, "$1/USD");
          const encodedSym = encodeURIComponent(slashSym);
          const data = await alpacaGet(
            `https://data.alpaca.markets/v2/crypto/us/bars?symbols=${encodedSym}&timeframe=1Day&start=${start}&end=${end}&limit=180`
          );
          bars = data.bars?.[slashSym] || [];
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

    // ── ASSET INFO ────────────────────────────────────────────────────────
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