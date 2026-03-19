import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const PUSHOVER_USER_KEY = Deno.env.get('PUSHOVER_USER_KEY');
const PUSHOVER_APP_TOKEN = Deno.env.get('PUSHOVER_APP_TOKEN');

async function sendPush(base44, { title, message, priority = 0, sound = 'pushover', trigger_type, symbol, value }) {
  const delivered_at = new Date().toISOString();
  try {
    if (!PUSHOVER_USER_KEY || !PUSHOVER_APP_TOKEN) throw new Error('Missing Pushover credentials');
    const formData = new URLSearchParams();
    formData.append('token', PUSHOVER_APP_TOKEN);
    formData.append('user', PUSHOVER_USER_KEY);
    formData.append('title', title);
    formData.append('message', message);
    formData.append('priority', String(priority));
    formData.append('sound', sound);
    const res = await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
      signal: AbortSignal.timeout(8000),
    });
    const result = await res.json().catch(() => ({}));
    const status = res.ok && result.status === 1 ? 'sent' : 'failed';
    await base44.asServiceRole.entities.NotificationLog.create({ trigger_type, title, message, symbol, value, delivered_at, status }).catch(() => {});
  } catch (e) {
    await base44.asServiceRole.entities.NotificationLog.create({ trigger_type, title, message, symbol, value, delivered_at, status: 'failed', error: e.message }).catch(() => {});
  }
}

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