import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const ARK_CSV_URL = 'https://ark-funds.com/wp-content/uploads/funds-etf-csv/ARK_INNOVATION_ETF_ARKK_HOLDINGS.csv';
const ARK_CSV_URL_ALT = 'https://ark-funds.com/wp-content/uploads/funds-etf-csv/ARK_INNOVATION_ETF_ARKK_HOLDINGS.csv';

const ARKK_FALLBACK = [
  'TSLA', 'NVDA', 'ROKU', 'COIN', 'SQ', 'ZOOM', 'SPOT', 'CRISPR', 'TDOC', 'PATH',
  'EXAS', 'BEAM', 'PACB', 'TWLO', 'ZM', 'SHOP', 'DKNG', 'RBLX', 'U', 'HOOD'
];

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

async function tryFetchCSV(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/csv,text/plain,*/*' },
    signal: AbortSignal.timeout(12000),
  }).catch(() => null);
  if (!res?.ok) return null;
  const text = await res.text().catch(() => '');
  return text;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const today = new Date().toISOString().split('T')[0];
    let records = [];
    let source = 'fallback';

    // Try primary CSV URL
    let csvText = await tryFetchCSV(ARK_CSV_URL);

    // Try alternate URL if primary failed
    if (!csvText && ARK_CSV_URL_ALT !== ARK_CSV_URL) {
      csvText = await tryFetchCSV(ARK_CSV_URL_ALT);
      if (csvText) source = 'csv_alt';
    } else if (csvText) {
      source = 'csv';
    }

    if (csvText) {
      const rows = parseCSV(csvText);
      const parsed = rows
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

      if (parsed.length > 0) {
        records = parsed;
      } else {
        source = 'fallback';
      }
    }

    // Fallback to hardcoded top 20
    if (records.length === 0) {
      source = 'fallback';
      records = ARKK_FALLBACK.map((symbol, i) => ({
        symbol,
        weight: parseFloat(((20 - i) * 0.75).toFixed(2)),
        date: today,
      }));
    }

    // Upsert
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