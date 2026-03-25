// api/cron/fetchCongressTrades.js
// Runs daily at noon ET - fetches House and Senate stock trades

import { supabase, sendPush } from '../../lib/supabase.js';

const HOUSE_URL = 'https://housestockwatcher.com/api/transactions_json';
const SENATE_URL = 'https://senatestockwatcher.com/api/transactions_json';

const PARTY_LOOKUP = {
  "Tommy Tuberville": "Republican", "Markwayne Mullin": "Republican", "Bill Hagerty": "Republican",
  "John Boozman": "Republican", "Roger Marshall": "Republican", "Rand Paul": "Republican",
  "Mike Crapo": "Republican", "Kevin Hern": "Republican", "Pat Fallon": "Republican",
  "David Rouzer": "Republican", "Morgan Griffith": "Republican", "Michael McCaul": "Republican",
  "Pete Sessions": "Republican", "Marjorie Taylor Greene": "Republican", "Jim Banks": "Republican",
  "Rick Scott": "Republican", "Marco Rubio": "Republican", "Ron Johnson": "Republican",
  "Mitch McConnell": "Republican", "Dan Crenshaw": "Republican", "Ted Cruz": "Republican",
  "Nancy Pelosi": "Democrat", "Ro Khanna": "Democrat", "Raja Krishnamoorthi": "Democrat",
  "Lois Frankel": "Democrat", "Josh Gottheimer": "Democrat", "Seth Moulton": "Democrat",
  "Suzan DelBene": "Democrat", "Adam Schiff": "Democrat", "Eric Swalwell": "Democrat",
  "Mark Warner": "Democrat", "Jon Ossoff": "Democrat", "Raphael Warnock": "Democrat",
  "John Hickenlooper": "Democrat", "Elizabeth Warren": "Democrat", "Daniel Goldman": "Democrat",
  "Bernie Sanders": "Independent", "Angus King": "Independent",
};

function inferParty(name) {
  if (!name) return "Unknown";
  const direct = PARTY_LOOKUP[name.trim()];
  if (direct) return direct;
  const lastName = name.trim().split(/\s+/).pop();
  for (const [key, party] of Object.entries(PARTY_LOOKUP)) {
    if (key.endsWith(lastName) && lastName.length > 3) return party;
  }
  return "Unknown";
}

function normalizeTransaction(raw) {
  if (!raw) return "buy";
  const lower = raw.toLowerCase().replace(/[\s_\-()+]/g, '');
  if (lower.includes('purchase') || lower.includes('buy') || lower.includes('bought')) return "buy";
  if (lower.includes('sale') || lower.includes('sell') || lower.includes('sold')) return "sell";
  if (lower.includes('exchange')) return "exchange";
  return "buy";
}

function calcDaysToDisclose(txnDate, disclosureDate) {
  if (!txnDate || !disclosureDate) return null;
  const d1 = new Date(txnDate);
  const d2 = new Date(disclosureDate);
  if (isNaN(d1) || isNaN(d2)) return null;
  return Math.round((d2 - d1) / (1000 * 60 * 60 * 24));
}

export default async function handler(req, res) {
  const started_at = new Date().toISOString();

  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 365); // 1 year of history

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
      const chamber = item._chamber || (item.senator ? 'Senate' : 'House');
      const rawTxn = item.transaction || item.type || item.transaction_type || item.Transaction || '';
      const daysToDisclose = calcDaysToDisclose(transactionDate, disclosureDate);

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
        days_to_disclose: daysToDisclose,
      };
    }).filter(Boolean);

    // Clear old and insert fresh
    await supabase.from('congress_trades').delete().neq('id', '00000000-0000-0000-0000-000000000000');

    // Insert in batches of 100
    for (let i = 0; i < records.length; i += 100) {
      const batch = records.slice(i, i + 100);
      await supabase.from('congress_trades').insert(batch);
    }

    // Notify large trades ($50k+)
    const LARGE_AMOUNTS = ['$50,001', '$100,001', '$250,001', '$500,001', 'Over $1,000,000'];
    const recent = records.filter(r => {
      const d = new Date(r.disclosure_date);
      const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      return d >= threeDaysAgo && LARGE_AMOUNTS.some(a => r.amount_range?.includes(a.replace(',', '')));
    });

    for (const trade of recent.slice(0, 5)) {
      const action = trade.transaction === 'buy' ? 'bought' : 'sold';
      await sendPush({
        title: 'AutoTrader: 🏛️ Congress Alert',
        message: `${trade.representative} ${action} ${trade.amount_range} of ${trade.symbol} on ${trade.transaction_date}`,
        priority: 1, sound: 'magic', trigger_type: 'congress_large_trade', symbol: trade.symbol, value: trade.amount_range,
      });
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
