// api/fetchStockData.js
// Handles all Alpaca market data requests for Manual Mode
// Replaces Base44 fetchStockData function

const ALPACA_KEY = process.env.ALPACA_API_KEY;
const ALPACA_SECRET = process.env.ALPACA_API_SECRET;

const HEADERS = {
  'APCA-API-KEY-ID': ALPACA_KEY,
  'APCA-API-SECRET-KEY': ALPACA_SECRET,
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function alpacaGet(url, retries = 3) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      headers: HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    if (res.status === 429) {
      if (attempt < retries) {
        await sleep(5000 * Math.pow(2, attempt));
        continue;
      }
      throw new Error('Rate limited — please try again in a moment');
    }
    if (!res.ok) {
      throw new Error(`Data unavailable (${res.status})`);
    }
    return res.json();
  }
}

function toCryptoSlash(sym) {
  return sym.includes('/') ? sym : sym.replace(/^([A-Z]+)(USD)$/, '$1/USD');
}

export default async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    let body = {};
    if (req.method === 'POST') {
      body = req.body || {};
    } else if (req.method === 'GET') {
      body = req.query || {};
    }

    const { action, symbols, symbol, start, end } = body;

    // ── TICKER BAR ──────────────────────────────────────────────────────────────
    if (action === 'ticker_bar') {
      const stockSyms = ['SPY', 'QQQ', 'DIA', 'IWM'];
      const results = {};

      try {
        const data = await alpacaGet(
          `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${stockSyms.join(',')}&feed=iex`
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
        console.error('Stock ticker error:', e.message);
      }

      // Crypto
      try {
        const cryptoRes = await alpacaGet(
          'https://data.alpaca.markets/v2/crypto/us/latest/trades?symbols=BTC%2FUSD,ETH%2FUSD'
        );
        const trades = cryptoRes.trades || {};
        for (const [slashSym, trade] of Object.entries(trades)) {
          const plainSym = slashSym.replace('/', '');
          results[plainSym] = { price: trade.p || 0, change_pct: 0 };
        }
        // Get daily bars for change_pct
        try {
          const today = new Date().toISOString().split('T')[0];
          const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
          const barsData = await alpacaGet(
            `https://data.alpaca.markets/v2/crypto/us/bars?symbols=BTC%2FUSD,ETH%2FUSD&timeframe=1Day&start=${yesterday}&end=${today}&limit=2`
          );
          const bars = barsData.bars || {};
          for (const [slashSym, symBars] of Object.entries(bars)) {
            const plainSym = slashSym.replace('/', '');
            if (symBars.length >= 2) {
              const prev = symBars[symBars.length - 2].c;
              const cur = symBars[symBars.length - 1].c;
              if (results[plainSym]) results[plainSym].change_pct = prev ? ((cur - prev) / prev) * 100 : 0;
            }
          }
        } catch (e) {
          console.error('Crypto change_pct error:', e.message);
        }
      } catch (e) {
        console.error('Crypto latest trades error:', e.message);
        try {
          const fallback = await alpacaGet(
            'https://data.alpaca.markets/v2/crypto/us/bars?symbols=BTC%2FUSD,ETH%2FUSD&timeframe=1Min&limit=1'
          );
          const bars = fallback.bars || {};
          for (const [slashSym, symBars] of Object.entries(bars)) {
            const plainSym = slashSym.replace('/', '');
            if (symBars.length > 0) {
              results[plainSym] = { price: symBars[symBars.length - 1].c, change_pct: 0 };
            }
          }
        } catch (e2) {
          console.error('Crypto fallback error:', e2.message);
        }
      }

      return res.status(200).json({ ticker: results });
    }

    // ── SNAPSHOTS (batch) ───────────────────────────────────────────────────────
    if (action === 'snapshots') {
      const symbolList = Array.isArray(symbols) ? symbols : (symbols || '').split(',').filter(Boolean);
      const stockSymbols = symbolList.filter(s => !s.includes('USD'));
      const cryptoSymbols = symbolList.filter(s => s.includes('USD'));
      const results = {};

      if (stockSymbols.length > 0) {
        try {
          const data = await alpacaGet(
            `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${stockSymbols.join(',')}&feed=iex`
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
          console.error('Snapshots error:', e.message);
        }
      }

      if (cryptoSymbols.length > 0) {
        const slashSymbols = cryptoSymbols.map(toCryptoSlash);
        try {
          const cryptoData = await alpacaGet(
            `https://data.alpaca.markets/v2/crypto/us/snapshots?symbols=${slashSymbols.map(encodeURIComponent).join(',')}`
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
              console.error('Crypto fallback error:', e2.message);
            }
            if (i < cryptoSymbols.length - 1) await sleep(300);
          }
        }
      }

      return res.status(200).json({ snapshots: results });
    }

    // ── HOT MOVERS ──────────────────────────────────────────────────────────────
    if (action === 'hot_movers') {
      const HOT_SYMBOLS = ['AAPL', 'MSFT', 'NVDA', 'TSLA', 'AMD', 'META', 'GOOGL', 'AMZN', 'SPY', 'QQQ'];
      try {
        const data = await alpacaGet(
          `https://data.alpaca.markets/v2/stocks/snapshots?symbols=${HOT_SYMBOLS.join(',')}&feed=iex`
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
        return res.status(200).json({ movers });
      } catch (e) {
        return res.status(200).json({ movers: HOT_SYMBOLS.map(s => ({ symbol: s, price: 0, change_pct: 0, volume: 0, vol_ratio: 1 })) });
      }
    }

    // ── BARS (candlestick chart) ─────────────────────────────────────────────────
    if (action === 'bars') {
      const isCrypto = symbol && (symbol.includes('USD') || symbol.includes('/'));
      try {
        let bars = [];
        if (isCrypto) {
          const slashSym = symbol.includes('/') ? symbol : symbol.replace(/^([A-Z]+)(USD)$/, '$1/USD');
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
        return res.status(200).json({ bars });
      } catch (e) {
        return res.status(200).json({ bars: [], error: e.message });
      }
    }

    // ── ASSET INFO ────────────────────────────────────────────────────────────────
    if (action === 'asset') {
      if (!symbol) return res.status(200).json({ fractionable: false });
      if (symbol.includes('USD') || symbol.includes('/')) {
        return res.status(200).json({ fractionable: true, name: symbol, exchange: 'Crypto' });
      }
      try {
        const data = await alpacaGet(`https://paper-api.alpaca.markets/v2/assets/${symbol}`);
        return res.status(200).json({ fractionable: data.fractionable || false, name: data.name || symbol, exchange: data.exchange || '' });
      } catch (e) {
        return res.status(200).json({ fractionable: false, name: symbol, exchange: '' });
      }
    }

    return res.status(400).json({ error: 'Unknown action' });

  } catch (error) {
    console.error('fetchStockData error:', error);
    return res.status(500).json({ error: error.message });
  }
}
