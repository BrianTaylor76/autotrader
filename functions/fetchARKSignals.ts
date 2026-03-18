import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const ARK_CSV_URL = 'https://ark-funds.com/wp-content/uploads/funds-etf-csv/ARK_INNOVATION_ETF_ARKK_HOLDINGS.csv';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const res = await fetch(ARK_CSV_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) {
      return Response.json({ error: `Failed to fetch ARK CSV: ${res.status}` }, { status: 502 });
    }

    const text = await res.text();
    const lines = text.trim().split('\n');

    // Find header row
    let headerIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes('ticker')) { headerIdx = i; break; }
    }

    const headers = lines[headerIdx].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
    const tickerCol = headers.findIndex(h => h === 'ticker');
    const weightCol = headers.findIndex(h => h.includes('weight'));
    const dateCol = headers.findIndex(h => h === 'date');

    const today = new Date().toISOString().split('T')[0];
    const records = [];

    for (let i = headerIdx + 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.replace(/"/g, '').trim());
      const symbol = cols[tickerCol];
      if (!symbol || symbol.length < 1 || symbol.length > 6) continue;

      const weight = weightCol >= 0 ? parseFloat(cols[weightCol]) || 0 : 0;
      const date = dateCol >= 0 ? cols[dateCol] : today;

      records.push({ symbol, weight, date: date || today });
    }

    // Delete old signals and re-insert fresh
    const existing = await base44.asServiceRole.entities.ARKSignal.list('-created_date', 500);
    for (const s of existing) {
      await base44.asServiceRole.entities.ARKSignal.delete(s.id);
    }

    for (const r of records) {
      await base44.asServiceRole.entities.ARKSignal.create(r);
    }

    return Response.json({ success: true, count: records.length, fetched_at: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});