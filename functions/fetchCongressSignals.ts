import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const QUIVER_API_KEY = Deno.env.get('QUIVER_API_KEY');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!QUIVER_API_KEY) {
      return Response.json({ error: 'QUIVER_API_KEY secret is not set' }, { status: 400 });
    }

    const res = await fetch('https://api.quiverquant.com/beta/live/congresstrading', {
      headers: {
        'Authorization': `Token ${QUIVER_API_KEY}`,
        'Accept': 'application/json',
      },
    });

    if (!res.ok) {
      const text = await res.text();
      return Response.json({ error: `Quiver API error: ${res.status} — ${text}` }, { status: 502 });
    }

    const data = await res.json();

    // Filter to last 30 days
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    const filtered = (Array.isArray(data) ? data : []).filter(item => {
      const d = new Date(item.TransactionDate || item.Date || '');
      return d >= cutoff;
    });

    // Delete old and re-insert
    const existing = await base44.asServiceRole.entities.CongressSignal.list('-created_date', 500);
    for (const s of existing) {
      await base44.asServiceRole.entities.CongressSignal.delete(s.id);
    }

    let count = 0;
    for (const item of filtered) {
      const symbol = item.Ticker || item.ticker;
      if (!symbol) continue;
      await base44.asServiceRole.entities.CongressSignal.create({
        symbol: symbol.toUpperCase(),
        representative: item.Representative || item.Name || 'Unknown',
        transaction: item.Transaction || item.Type || 'Unknown',
        amount: item.Amount || item.Range || '',
        date: item.TransactionDate || item.Date || new Date().toISOString().split('T')[0],
      });
      count++;
    }

    return Response.json({ success: true, count, fetched_at: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});