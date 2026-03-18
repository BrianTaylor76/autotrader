import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const HOUSE_URL = 'https://housestockwatcher.com/api/transactions_json';
const SENATE_URL = 'https://senatestockwatcher.com/api/transactions_json';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    const [houseRes, senateRes] = await Promise.all([
      fetch(HOUSE_URL, { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } }),
      fetch(SENATE_URL, { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } }),
    ]);

    let houseData = [];
    let senateData = [];

    if (houseRes.ok) {
      const raw = await houseRes.json();
      houseData = Array.isArray(raw) ? raw : (raw.data || raw.transactions || []);
    }
    if (senateRes.ok) {
      const raw = await senateRes.json();
      senateData = Array.isArray(raw) ? raw : (raw.data || raw.transactions || []);
    }

    const all = [...houseData, ...senateData];

    // Filter last 30 days and map fields
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

    const filtered = all.filter(item => {
      const dateStr = item.transaction_date || item.TransactionDate || item.date || item.Date || '';
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return !isNaN(d.getTime()) && d >= cutoff;
    });

    // Clear old signals
    const existing = await base44.asServiceRole.entities.CongressSignal.list('-created_date', 1000);
    for (const s of existing) {
      await base44.asServiceRole.entities.CongressSignal.delete(s.id);
    }

    let count = 0;
    for (const item of filtered) {
      const symbol = (item.ticker || item.Ticker || item.asset_description || '').toUpperCase().trim();
      if (!symbol || symbol.length > 10) continue;

      const dateStr = item.transaction_date || item.TransactionDate || item.date || item.Date || '';
      const rawTxn = item.type || item.transaction_type || item.Transaction || item.transaction || '';

      await base44.asServiceRole.entities.CongressSignal.create({
        symbol,
        representative: item.representative || item.Representative || item.name || item.senator || 'Unknown',
        transaction: normalizeTransaction(rawTxn),
        amount: item.amount || item.Amount || item.range || '',
        date: dateStr.split('T')[0] || new Date().toISOString().split('T')[0],
      });
      count++;
    }

    return Response.json({
      success: true,
      count,
      house_records: houseData.length,
      senate_records: senateData.length,
      fetched_at: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});