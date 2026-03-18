import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const ALPACA_DATA_URL = 'https://data.alpaca.markets';
const ALPACA_KEY = Deno.env.get('ALPACA_API_KEY');
const ALPACA_SECRET = Deno.env.get('ALPACA_API_SECRET');

const headers = {
  'APCA-API-KEY-ID': ALPACA_KEY,
  'APCA-API-SECRET-KEY': ALPACA_SECRET,
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { symbol, timeframe = '5Min', limit = 78 } = await req.json();
    if (!symbol) return Response.json({ error: 'symbol is required' }, { status: 400 });

    const url = `${ALPACA_DATA_URL}/v2/stocks/${symbol}/bars?timeframe=${timeframe}&limit=${limit}&feed=iex&sort=asc`;
    const res = await fetch(url, { headers });

    if (!res.ok) {
      const err = await res.text();
      return Response.json({ error: `Alpaca error: ${err}` }, { status: res.status });
    }

    const data = await res.json();
    const bars = (data.bars || []).map((b) => ({
      time: new Date(b.t).getTime(),
      open: b.o,
      high: b.h,
      low: b.l,
      close: b.c,
      volume: b.v,
    }));

    // Latest quote for real-time price
    const quoteUrl = `${ALPACA_DATA_URL}/v2/stocks/${symbol}/quotes/latest?feed=iex`;
    const quoteRes = await fetch(quoteUrl, { headers });
    let latestPrice = bars.length > 0 ? bars[bars.length - 1].close : null;
    if (quoteRes.ok) {
      const quoteData = await quoteRes.json();
      const q = quoteData.quote;
      if (q) latestPrice = (q.ap + q.bp) / 2;
    }

    return Response.json({ bars, latestPrice, symbol });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});