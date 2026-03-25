// api/fetchCongressTrades.js
// Fetches congressional trading data for Congress Watch page
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const HOUSE_URL = 'https://housestockwatcher.com/api/transactions_json';
const SENATE_URL = 'https://senatestockwatcher.com/api/transactions_json';

const PARTY_LOOKUP = {
  'Tommy Tuberville': 'Republican', 'Markwayne Mullin': 'Republican', 'Bill Hagerty': 'Republican',
  'Roger Marshall': 'Republican', 'Rand Paul': 'Republican', 'Mike Crapo': 'Republican',
  'Kevin Hern': 'Republican', 'Pat Fallon': 'Republican', 'Marjorie Taylor Greene': 'Republican',
  'Rick Scott': 'Republican', 'Marco Rubio': 'Republican', 'Ted Cruz': 'Republican',
  'Dan Crenshaw': 'Republican', 'Chip Roy': 'Republican', 'Mike Kelly': 'Republican',
  'Nancy Pelosi': 'Democrat', 'Ro Khanna': 'Democrat', 'Raja Krishnamoorthi': 'Democrat',
  'Lois Frankel': 'Democrat', 'Josh Gottheimer': 'Democrat', 'Seth Moulton': 'Democrat',
  'Adam Schiff': 'Democrat', 'Mark Warner': 'Democrat', 'Jon Ossoff': 'Democrat',
  'Raphael Warnock': 'Democrat', 'John Hickenlooper': 'Democrat', 'Elizabeth Warren': 'Democrat',
  'Daniel Goldman': 'Democrat', 'Alexandria Ocasio-Cortez': 'Democrat',
  'Bernie Sanders': 'Independent', 'Angus King': 'Independent',
};

function inferParty(name) {
  if (!name) return 'Unknown';
  const direct = PARTY_LOOKUP[name.trim()];
  if (direct) return direct;
  const lastName = name.trim().split(/\s+/).pop();
  for (const [key, party] of Object.entries(PARTY_LOOKUP)) {
    if (key.endsWith(lastName) && lastName.length > 3) return party;
  }
  return 'Unknown';
}

function normalizeTransaction(raw) {
  if (!raw) return 'buy';
  const lower = raw.toLowerCase().replace(/[\s_\-()+]/g, '');
  if (lower.includes('purchase') || lower.includes('buy') || lower.includes('bought')) return 'buy';
  if (lower.includes('sale') || lower.includes('sell') || lower.includes('sold')) return 'sell';
  if (lower.includes('exchange')) return 'exchange';
  return 'buy';
}

function calcDaysToDisclose(txnDate, disclosureDate) {
  if (!txnDate || !disclosureDate) return null;
  const d1 = new Date(txnDate);
  const d2 = new Date(disclosureDate);
  if (isNaN(d1) || isNaN(d2)) return null;
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const started_at = new Date().toISOString();

  try {
    const cutoff = new Date();
    cutoff.setFullYear(cutoff.getFullYear() - 1);

    const [houseRes, senateRes] = await Promise.all([
      fetch(HOUSE_URL, { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) }).catch(() => null),
      fetch(SENATE_URL, { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(15000) }).catch(() => null),
    ]);

    let houseData = [];
    let senateData = [];

    if (houseRes?.ok) {
      const raw = await houseRes.json().catch(() => []);
      houseData = (Array.isArray(raw) ? raw : (raw.data || raw.transactions || [])).map(r => ({ ...r, _chamber: 'House' }));
    }
    if (senateRes?.ok) {
      const raw = await senateRes.json().catch(() => []);
      senateData = (Array.isArray(raw) ? raw : (raw.data || raw.transactions || [])).map(r => ({ ...r, _chamber: 'Senate' }));
    }

    const all = [...houseData, ...senateData];

    const filtered = all.filter(item => {
      const dateStr = item.disclosure_date || item.transaction_date || item.date || '';
      if (!dateStr) return false;
      const d = new Date(dateStr);
      return !isNaN(d.getTime()) && d >= cutoff;
    });

    const records = filtered.map(item => {
      const symbol = (item.ticker || item.symbol || item.Ticker || item.Symbol || '').toUpperCase().trim();
      if (!symbol || symbol.length > 10) return null;

      const transactionDate = item.transaction_date || item.TransactionDate || item.date || '';
      const disclosureDate = item.disclosure_date || item.DisclosureDate || '';
      const representative = item.representative || item.Representative || item.name || item.senator || 'Unknown';
      const chamber = item._chamber || 'House';
      const rawTxn = item.transaction || item.type || item.transaction_type || item.Transaction || '';

      return {
        symbol,
        representative,
        chamber,
        state: item.state || item.State || '',
        party: inferParty(representative),
        transaction: normalizeTransaction(rawTxn),
        amount_range: item.amount || item.Amount || item.range || '',
        disclosure_date: disclosureDate.split('T')[0] || '',
        transaction_date: transactionDate.split('T')[0] || '',
        description: item.asset_description || item.description || '',
        days_to_disclose: calcDaysToDisclose(transactionDate, disclosureDate),
      };
    }).filter(Boolean);

    // Clear and reinsert
    await supabase.from('congress_trades').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    for (let i = 0; i < records.length; i += 100) {
      await supabase.from('congress_trades').insert(records.slice(i, i + 100));
    }

    // Notify large trades
    const LARGE_AMOUNTS = ['$50,001', '$100,001', '$250,001', '$500,001', 'Over $1,000,000'];
    const recent = records.filter(r => {
      const d = new Date(r.disclosure_date);
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      return d >= threeDaysAgo && LARGE_AMOUNTS.some(a => r.amount_range?.includes(a.replace(',', '')));
    });

    for (const trade of recent.slice(0, 5)) {
      const action = trade.transaction === 'buy' ? 'bought' : 'sold';
      const PUSHOVER_USER_KEY = process.env.PUSHOVER_USER_KEY;
      const PUSHOVER_APP_TOKEN = process.env.PUSHOVER_APP_TOKEN;
      if (PUSHOVER_USER_KEY && PUSHOVER_APP_TOKEN) {
        const formData = new URLSearchParams();
        formData.append('token', PUSHOVER_APP_TOKEN);
        formData.append('user', PUSHOVER_USER_KEY);
        formData.append('title', 'AutoTrader: 🏛️ Congress Alert');
        formData.append('message', `${trade.representative} ${action} ${trade.amount_range} of ${trade.symbol} on ${trade.transaction_date}`);
        formData.append('priority', '1');
        formData.append('sound', 'magic');
        await fetch('https://api.pushover.net/1/messages.json', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: formData.toString(),
        }).catch(() => {});
      }
    }

    return res.status(200).json({
      success: true,
      count: records.length,
      house_count: houseData.length,
      senate_count: senateData.length,
      started_at,
      completed_at: new Date().toISOString(),
    });
  } catch (error) {
    console.error('fetchCongressTrades error:', error);
    return res.status(500).json({ error: error.message });
  }
}
