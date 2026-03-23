import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const FINNHUB_KEY = Deno.env.get('FINNHUB_API_KEY');

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

    const settingsList = await base44.asServiceRole.entities.StrategySettings.list('-created_date', 1);
    const watchlist = settingsList[0]?.watchlist || [];

    if (watchlist.length === 0) {
      return Response.json({ message: 'Watchlist is empty', count: 0 });
    }

    const today = new Date().toISOString().split('T')[0];

    // Fetch Finnhub sentiment for all symbols in parallel
    const fetched = await Promise.all(
      watchlist.map(async (symbol) => {
        try {
          const url = `https://finnhub.io/api/v1/news-sentiment?symbol=${symbol}&token=${FINNHUB_KEY}`;
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) }).catch(() => null);

          if (!res?.ok) {
            return { symbol, bullish: 0, bearish: 0, sentiment_score: 0.5 };
          }

          const data = await res.json().catch(() => ({}));
          const score = typeof data.companyNewsScore === 'number' ? data.companyNewsScore : 0.5;
          const articlesInWeek = data.buzz?.articlesInLastWeek || 10;

          const bullish = Math.round(articlesInWeek * score);
          const bearish = Math.round(articlesInWeek * (1 - score));

          return { symbol, bullish, bearish, sentiment_score: score };
        } catch {
          return { symbol, bullish: 0, bearish: 0, sentiment_score: 0.5 };
        }
      })
    );

    // Load existing records and upsert
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

    // Fire notifications for sentiment spikes
    for (const { symbol, bullish, bearish, sentiment_score } of fetched) {
      const total = bullish + bearish;
      if (total < 5) continue;
      if (sentiment_score >= 0.8) {
        const pct = Math.round(sentiment_score * 100);
        await sendPush(base44, {
          title: 'AutoTrader: 📊 Sentiment Spike',
          message: `${symbol} news sentiment is ${pct}% bullish — unusual activity detected`,
          priority: 0, sound: 'bike', trigger_type: 'sentiment_spike', symbol, value: `${pct}% bullish`,
        });
      } else if (sentiment_score <= 0.2) {
        const pct = Math.round((1 - sentiment_score) * 100);
        await sendPush(base44, {
          title: 'AutoTrader: 📊 Sentiment Spike',
          message: `${symbol} news sentiment is ${pct}% bearish — unusual activity detected`,
          priority: 0, sound: 'bike', trigger_type: 'sentiment_spike', symbol, value: `${pct}% bearish`,
        });
      }
    }

    return Response.json({ success: true, results: fetched, fetched_at: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});