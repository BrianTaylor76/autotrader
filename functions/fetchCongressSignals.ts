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
    if (lower.includes(key.replace(/_/g, ''))) return val;
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
        // Handle both field name formats for date
        const dateStr = item.disclosure_date || item.transaction_date || item.TransactionDate || item.date || item.Date || '';
        if (!dateStr) return false;
        const d = new Date(dateStr);
        return !isNaN(d.getTime()) && d >= cutoff;
      })
      .slice(0, 100);

    const records = filtered
      .map(item => {
        // Handle both field name formats for symbol
        const symbol = (item.ticker || item.symbol || item.Ticker || item.Symbol || item.asset_description || '').toUpperCase().trim();
        if (!symbol || symbol.length > 10) return null;

        // Handle both field name formats for date
        const dateStr = item.disclosure_date || item.transaction_date || item.TransactionDate || item.date || item.Date || '';

        // Handle both field name formats for transaction type
        const rawTxn = item.transaction || item.type || item.transaction_type || item.Transaction || '';

        return {
          symbol,
          representative: item.representative || item.Representative || item.name || item.senator || 'Unknown',
          transaction: normalizeTransaction(rawTxn),
          amount: item.amount || item.Amount || item.range || '',
          date: (dateStr.split('T')[0]) || new Date().toISOString().split('T')[0],
        };
      })
      .filter(Boolean);

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