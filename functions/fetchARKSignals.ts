import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

// Use the ARK holdings API endpoint (JSON) which is faster than CSV parsing
const ARK_API_URL = 'https://arkfunds.io/api/v2/etf/holdings?symbol=ARKK';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch ARK holdings as JSON (much faster than CSV)
    const res = await fetch(ARK_API_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      return Response.json({ error: `ARK API responded with ${res.status}` }, { status: 502 });
    }

    const json = await res.json();
    const holdings = json?.holdings || [];

    const today = new Date().toISOString().split('T')[0];
    const records = holdings
      .filter(h => h.ticker && h.ticker.trim().length > 0 && h.ticker !== '-')
      .map(h => ({
        symbol: h.ticker.trim().toUpperCase(),
        weight: parseFloat(h.weight_pct) || 0,
        date: h.date || today,
      }));

    // Delete old + bulk create new in parallel
    const existing = await base44.asServiceRole.entities.ARKSignal.list('-created_date', 500);
    await Promise.all(existing.map(s => base44.asServiceRole.entities.ARKSignal.delete(s.id)));

    // Bulk create in batches of 20
    for (let i = 0; i < records.length; i += 20) {
      await Promise.all(
        records.slice(i, i + 20).map(r => base44.asServiceRole.entities.ARKSignal.create(r))
      );
    }

    return Response.json({
      success: true,
      count: records.length,
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});