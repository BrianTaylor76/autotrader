import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const settingsList = await base44.asServiceRole.entities.StrategySettings.list('-created_date', 1);
    const watchlist = settingsList[0]?.watchlist || [];

    if (watchlist.length === 0) {
      return Response.json({ message: 'Watchlist is empty', count: 0 });
    }

    const today = new Date().toISOString().split('T')[0];

    // Fetch all symbols in parallel
    const fetched = await Promise.all(
      watchlist.map(async (symbol) => {
        const res = await fetch(
          `https://api.stocktwits.com/api/2/streams/symbol/${symbol}.json`,
          { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(5000) }
        ).catch(() => null);

        if (!res?.ok) return { symbol, bullish: 0, bearish: 0, sentiment_score: 0.5 };

        const data = await res.json().catch(() => ({}));
        const messages = (data.messages || []).slice(0, 30);

        let bullish = 0;
        let bearish = 0;
        for (const msg of messages) {
          const sentiment = msg.entities?.sentiment?.basic;
          if (sentiment === 'Bullish') bullish++;
          else if (sentiment === 'Bearish') bearish++;
        }

        const total = bullish + bearish;
        const sentiment_score = total > 0 ? bullish / total : 0.5;
        return { symbol, bullish, bearish, sentiment_score };
      })
    );

    // Load existing records + upsert all in parallel
    const existing = await base44.asServiceRole.entities.SentimentSignal.list('-created_date', 200);
    const existingBySymbol = Object.fromEntries(existing.map(e => [e.symbol.toUpperCase(), e]));

    await Promise.all(
      fetched.map(({ symbol, bullish, bearish, sentiment_score }) => {
        const payload = { symbol, bullish_count: bullish, bearish_count: bearish, sentiment_score, date: today };
        const prev = existingBySymbol[symbol.toUpperCase()];
        if (prev) return base44.asServiceRole.entities.SentimentSignal.update(prev.id, payload);
        return base44.asServiceRole.entities.SentimentSignal.create(payload);
      })
    );

    return Response.json({ success: true, results: fetched, fetched_at: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});