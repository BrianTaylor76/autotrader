// api/fetchCongressTrades.js
// Fetches congressional trading data using Finnhub API
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const FINNHUB_KEY = process.env.FINNHUB_API_KEY;

// Extended symbol list to get broad congressional trading data
const CONGRESS_SYMBOLS = [
  'SPY', 'QQQ', 'AAPL', 'MSFT', 'NVDA', 'GOOGL', 'AMZN', 'META', 'TSLA', 'AMD',
  'JPM', 'BAC', 'WFC', 'GS', 'MS', 'V', 'MA', 'UNH', 'JNJ', 'PFE',
  'MRNA', 'ABT', 'TMO', 'LMT', 'RTX', 'NOC', 'BA', 'GD', 'XOM', 'CVX',
];

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchFinnhubCongressTrades(symbol) {
  try {
    const url = `https://finnhub.io/api/v1/stock/congressional-trading?symbol=${symbol}&token=${FINNHUB_KEY}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return [];
    const data = await res.json().catch(() => ({}));
    return data.data || [];
  } catch {
    return [];
  }
}

function inferParty(name) {
  const PARTY_LOOKUP = {
    'Tommy Tuberville': 'Republican', 'Markwayne Mullin': 'Republican',
    'Bill Hagerty': 'Republican', 'Roger Marshall': 'Republican',
    'Rand Paul': 'Republican', 'Mike Crapo': 'Republican',
    'Kevin Hern': 'Republican', 'Pat Fallon': 'Republican',
    'Marjorie Taylor Greene': 'Republican', 'Rick Scott': 'Republican',
    'Marco Rubio': 'Republican', 'Ted Cruz': 'Republican',
    'Dan Crenshaw': 'Republican', 'Chip Roy': 'Republican',
    'Mike Kelly': 'Republican', 'Nancy Pelosi': 'Democrat',
    'Ro Khanna': 'Democrat', 'Raja Krishnamoorthi': 'Democrat',
    'Lois Frankel': 'Democrat', 'Josh Gottheimer': 'Democrat',
    'Seth Moulton': 'Democrat', 'Adam Schiff': 'Democrat',
    'Mark Warner': 'Democrat', 'Jon Ossoff': 'Democrat',
    'Raphael Warnock': 'Democrat', 'John Hickenlooper': 'Democrat',
    'Elizabeth Warren': 'Democrat', 'Daniel Goldman': 'Democrat',
    'Alexandria Ocasio-Cortez': 'Democrat', 'Bernie Sanders': 'Independent',
    'Angus King': 'Independent',
  };
  if (!name) return 'Unknown';
  const direct = PARTY_LOOKUP[name.trim()];
  if (direct) return direct;
  const lastName = name.trim().split(/\s+/).pop();
  for (const [key, party] of Object.entries(PARTY_LOOKUP)) {
    if (key.endsWith(lastName) && lastName.length > 3) return party;
  }
  return 'Unknown';
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
    if (!FINNHUB_KEY) {
      return res.status(500).json({ error: 'FINNHUB_API_KEY not configured' });
    }

    // Get user watchlist to include their symbols too
    const { data: settingsList } = await supabase
      .from('strategy_settings')
      .select('watchlist')
      .order('created_date', { ascending: false })
      .limit(1);

    const userWatchlist = settingsList?.[0]?.watchlist || [];
    const allSymbols = [...new Set([...userWatchlist, ...CONGRESS_SYMBOLS])];

    const allRecords = [];
    let apiCallCount = 0;

    for (const symbol of allSymbols) {
      const trades = await fetchFinnhubCongressTrades(symbol);
      apiCallCount++;

      for (const t of trades) {
        const transactionRaw = (t.transactionType || t.transaction || '').toLowerCase();
        const transaction =
          transactionRaw.includes('purchase') || transactionRaw.includes('buy')
            ? 'buy'
            : transactionRaw.includes('sale') || transactionRaw.includes('sell')
            ? 'sell'
            : 'buy';

        allRecords.push({
          symbol: symbol.toUpperCase(),
          representative: t.name || t.representative || 'Unknown',
          chamber: t.chamber || 'Unknown',
          state: t.state || '',
          party: t.party || inferParty(t.name || ''),
          transaction,
          amount_range: t.amount || t.amountRange || '',
          disclosure_date: (t.filedDate || t.disclosureDate || '').split('T')[0],
          transaction_date: (t.transactionDate || t.date || '').split('T')[0],
          description: t.asset || t.assetDescription || symbol,
          days_to_disclose: calcDaysToDisclose(
            t.transactionDate || t.date,
            t.filedDate || t.disclosureDate
          ),
        });
      }

      // Rate limit safety: pause every 10 calls
      if (apiCallCount % 10 === 0) {
        await sleep(1000);
      }
    }

    // Deduplicate
    const seen = new Set();
    const uniqueRecords = allRecords.filter(r => {
      const key = `${r.symbol}-${r.representative}-${r.transaction_date}-${r.transaction}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Clear and reinsert
    if (uniqueRecords.length > 0) {
      await supabase
        .from('congress_trades')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      for (let i = 0; i < uniqueRecords.length; i += 100) {
        await supabase
          .from('congress_trades')
          .insert(uniqueRecords.slice(i, i + 100));
      }

      // Alert for large recent trades
      const PUSHOVER_USER_KEY = process.env.PUSHOVER_USER_KEY;
      const PUSHOVER_APP_TOKEN = process.env.PUSHOVER_APP_TOKEN;
      if (PUSHOVER_USER_KEY && PUSHOVER_APP_TOKEN) {
        const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        const recentLarge = uniqueRecords.filter(r => {
          const d = new Date(r.disclosure_date);
          const amt = (r.amount_range || '').replace(/[,$]/g, '');
          return d >= threeDaysAgo && (amt.includes('50001') || amt.includes('100001') || amt.includes('250001'));
        });

        for (const trade of recentLarge.slice(0, 3)) {
          const action = trade.transaction === 'buy' ? 'bought' : 'sold';
          const formData = new URLSearchParams();
          formData.append('token', PUSHOVER_APP_TOKEN);
          formData.append('user', PUSHOVER_USER_KEY);
          formData.append('title', '🏛️ Congress Alert');
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
    }

    return res.status(200).json({
      success: true,
      count: uniqueRecords.length,
      symbols_checked: allSymbols.length,
      started_at,
      completed_at: new Date().toISOString(),
    });

  } catch (error) {
    console.error('fetchCongressTrades error:', error);
    return res.status(500).json({ error: error.message });
  }
}
