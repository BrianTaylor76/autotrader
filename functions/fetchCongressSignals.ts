import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const HOUSE_URL = 'https://housestockwatcher.com/api/transactions_json';
const SENATE_URL = 'https://senatestockwatcher.com/api/transactions_json';

const TRANSACTION_MAP = {
  'purchase': 'Purchase',
  'buy': 'Purchase',
  'sale_full': 'Sale (Full)',
  'sale_partial': 'Sale (Partial)',
  'sale': 'Sale',
  'sell': 'Sale',
  'exchange': 'Exchange',
};

function normalizeTransaction(raw) {
  if (!raw) return 'Purchase';
  const lower = raw.toLowerCase().replace(/[\s_-]+/g, '_');
  for (const [key, val] of Object.entries(TRANSACTION_MAP)) {
    if (lower.includes(key.replace('_', ''))) return val;
  }
  return raw;
}

async function batchOp(items, fn, size = 20) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    // Fetch both sources in parallel with a timeout
    const [houseRes, senateRes] = await Promise.all([
      fetch(HOUSE_URL, { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) }).catch(() => null),
      fetch(SENATE_URL, { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(10000) }).catch(() => null),
    ]);

    let houseData = [];
    let senateData = [];

    if (houseRes?.ok) {
      const raw = await houseRes.json().catch(() => []);
      houseData = Array.isArray(raw) ? raw : (raw.data || raw.transactions || []);
    }
    if (senateRes?.ok) {
      const raw = await senateRes.json().catch(() => []);
      senateData = Array.isArray(raw) ? raw : (raw.data || raw.transactions || []);
    }

    const all = [...houseData, ...senateData];

    const filtered = all
      .filter(item => {
        const dateStr = item.transaction_date || item.TransactionDate || item.date || item.Date || '';
        if (!dateStr) return false;
        const d = new Date(dateStr);
        return !isNaN(d.getTime()) && d >= cutoff;
      })
      .slice(0, 100); // Cap at 100 most recent records to stay within time limits

    const records = filtered
      .map(item => {
        const symbol = (item.ticker || item.Ticker || item.asset_description || '').toUpperCase().trim();
        if (!symbol || symbol.length > 10) return null;
        const dateStr = item.transaction_date || item.TransactionDate || item.date || item.Date || '';
        const rawTxn = item.type || item.transaction_type || item.Transaction || item.transaction || '';
        return {
          symbol,
          representative: item.representative || item.Representative || item.name || item.senator || 'Unknown',
          transaction: normalizeTransaction(rawTxn),
          amount: item.amount || item.Amount || item.range || '',
          date: (dateStr.split('T')[0]) || new Date().toISOString().split('T')[0],
        };
      })
      .filter(Boolean);

    // Delete old + create new in parallel batches
    const existing = await base44.asServiceRole.entities.CongressSignal.list('-created_date', 500);
    await batchOp(existing, s => base44.asServiceRole.entities.CongressSignal.delete(s.id));
    await batchOp(records, r => base44.asServiceRole.entities.CongressSignal.create(r));

    return Response.json({
      success: true,
      count: records.length,
      house_records: houseData.length,
      senate_records: senateData.length,
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});