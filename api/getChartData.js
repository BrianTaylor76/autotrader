// api/getChartData.js
const ALPACA_KEY = process.env.ALPACA_API_KEY;
const ALPACA_SECRET = process.env.ALPACA_API_SECRET;

const headers = {
  'APCA-API-KEY-ID': ALPACA_KEY,
  'APCA-API-SECRET-KEY': ALPACA_SECRET,
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const { symbol = 'SPY', timeframe = '5Min', limit = 78 } = req.body || req.query || {};

    const isCrypto = /^[A-Z]+USD$/.test(symbol) || symbol.includes('/');
    let rawBars = [];

    if (isCrypto) {
      const slashSym = symbol.includes('/') ? symbol : symbol.replace(/^([A-Z]+)(USD)$/, '$1/USD');
      const encodedSym = encodeURIComponent(slashSym);
      const url = `https://data.alpaca.markets/v2/crypto/us/bars?symbols=${encodedSym}&timeframe=${timeframe}&limit=${limit}&sort=asc`;
      const alpacaRes = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (!alpacaRes.ok) {
        const err = await alpacaRes.text();
        return res.status(alpacaRes.status).json({ error: `Alpaca crypto error: ${err}` });
      }
      const data = await alpacaRes.json();
      rawBars = data.bars?.[slashSym] || [];
    } else {
      const url = `https://data.alpaca.markets/v2/stocks/${symbol}/bars?timeframe=${timeframe}&limit=${limit}&feed=iex&sort=asc`;
      const alpacaRes = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
      if (!alpacaRes.ok) {
        const err = await alpacaRes.text();
        return res.status(alpacaRes.status).json({ error: `Alpaca error: ${err}` });
      }
      const data = await alpacaRes.json();
      rawBars = data.bars || [];
    }

    const bars = rawBars.map(b => ({
      date: new Date(b.t).getTime(),
      time: new Date(b.t).getTime(),
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
      volume: b.v,
    }));

    const latestPrice = bars.length > 0 ? bars[bars.length - 1].close : null;
    return res.status(200).json({ bars, latestPrice, symbol });
  } catch (error) {
    console.error('getChartData error:', error);
    return res.status(500).json({ error: error.message });
  }
}
