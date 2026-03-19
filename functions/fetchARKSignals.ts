import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const ARK_CSV_URL = 'https://ark-funds.com/wp-content/uploads/funds-etf-csv/ARK_INNOVATION_ETF_ARKK_HOLDINGS.csv';

const ARKK_FALLBACK = ['TSLA', 'NVDA', 'ROKU', 'COIN', 'SQ', 'ZOOM', 'SPOT', 'CRISPR', 'TDOC', 'PATH'];

function parseCSV(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.replace(/"/g, '').trim());
    const row = {};
    headers.forEach((h, idx) => { row[h] = cols[idx] || ''; });
    results.push(row);
  }
  return results;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const today = new Date().toISOString().split('T')[0];
    let records = [];
    let source = 'csv';

    // Try fetching the CSV
    const res = await fetch(ARK_CSV_URL, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/csv,text/plain,*/*' },
      signal: AbortSignal.timeout(12000),
    }).catch(() => null);

    if (res?.ok) {
      const text = await res.text().catch(() => '');
      const rows = parseCSV(text);
      records = rows
        .filter(r => {
          const ticker = r.ticker || r.symbol || r['ticker symbol'] || '';
          return ticker && ticker.trim().length > 0 && ticker !== '-' && ticker.toUpperCase() !== 'N/A';
        })
        .map(r => {
          const ticker = (r.ticker || r.symbol || r['ticker symbol'] || '').trim().toUpperCase();
          const weight = parseFloat(r['weight(%)'] || r.weight || r['weight_pct'] || 0);
          return { symbol: ticker, weight, date: r.date || today };
        })
        .filter(r => r.symbol.length > 0 && r.symbol.length <= 10);
    }

    // Fall back to hardcoded top 10 if CSV failed or returned nothing
    if (records.length === 0) {
      source = 'fallback';
      records = ARKK_FALLBACK.map((symbol, i) => ({
        symbol,
        weight: parseFloat(((10 - i) * 1.5).toFixed(2)),
        date: today,
      }));
    }

    // Upsert: load existing, update or create
    const existing = await base44.asServiceRole.entities.ARKSignal.list('-created_date', 500);
    const existingBySymbol = Object.fromEntries(existing.map(e => [e.symbol.toUpperCase(), e]));

    await Promise.all(records.map(r => {
      const prev = existingBySymbol[r.symbol.toUpperCase()];
      if (prev) return base44.asServiceRole.entities.ARKSignal.update(prev.id, r);
      return base44.asServiceRole.entities.ARKSignal.create(r);
    }));

    return Response.json({ success: true, count: records.length, source, fetched_at: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});