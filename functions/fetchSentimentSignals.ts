import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const settingsList = await base44.asServiceRole.entities.StrategySettings.list('-created_date', 1);
    const settings = settingsList[0];
    const watchlist = settings?.watchlist || [];

    if (watchlist.length === 0) {
      return Response.json({ message: 'Watchlist is empty', count: 0 });
    }

    const today = new Date().toISOString().split('T')[0];
    const results = [];

    for (const symbol of watchlist) {
      const res = await fetch(`https://api.stocktwits.com/api/2/streams/symbol/${symbol}.json`);
      if (!res.ok) {
        results.push({ symbol, error: `HTTP ${res.status}` });
        continue;
      }

      const data = await res.json();
      const messages = data.messages || [];

      let bullish = 0;
      let bearish = 0;

      for (const msg of messages.slice(0, 30)) {
        const sentiment = msg.entities?.sentiment?.basic;
        if (sentiment === 'Bullish') bullish++;
        else if (sentiment === 'Bearish') bearish++;
      }

      const total = bullish + bearish;
      const sentiment_score = total > 0 ? bullish / total : 0.5;

      // Delete old signal for this symbol and insert fresh
      const existing = await base44.asServiceRole.entities.SentimentSignal.filter({ symbol });
      for (const s of existing) {
        await base44.asServiceRole.entities.SentimentSignal.delete(s.id);
      }

      await base44.asServiceRole.entities.SentimentSignal.create({
        symbol,
        bullish_count: bullish,
        bearish_count: bearish,
        sentiment_score,
        date: today,
      });

      results.push({ symbol, bullish, bearish, sentiment_score });
    }

    return Response.json({ success: true, results, fetched_at: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});