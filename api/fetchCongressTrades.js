// api/fetchCongressTrades.js
// Fetches congressional trading data using Finnhub API
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const FINNHUB_KEY = process.env.FINNHUB_API_KEY;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();

  const started_at = new Date().toISOString();

  try {
    const { data: settingsList } = await supabase
      .from('strategy_settings')
      .select('watchlist')
      .order('created_date', { ascending: false })
      .limit(1);

    const watchlist = settingsList?.[0]?.watchlist?.length > 0
      ? settingsList[0].watchlist
      : ['SPY', 'QQQ', 'AAPL', 'TSLA', 'NVDA', 'MSFT', 'AMZN', 'META', 'GOOGL', 'AMD'];

    if (!FINNHUB_KEY) {
      return res.status(500).json({ error: 'FINNHUB_API_KEY not configured' });
    }

    const allRecords = [];

    for (const symbol of watchlist) {
      try {
        const url = `https://finnhub.io/api/v1/stock/congressional-trading?symbol=${symbol}&token=${FINNHUB_KEY}`;
        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
          console.error(`Finnhub ${symbol}: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const trades = data.data || [];

        for (const t of trades) {
          const txnType = (t.transactionType || '').toLowerCase();
          allRecords.push({
            symbol: symbol.toUpperCase(),
            representative: t.name || 'Unknown',
            chamber: t.chamber || 'Unknown',
            state: '',
            party: t.party || 'Unknown',
            transaction: txnType.includes('purchase') || txnType.includes('buy') ? 'buy' : 'sell',
            amount_range: t.amount || '',
            disclosure_date: t.filedDate ? t.filedDate.split('T')[0] : '',
            transaction_date: t.transactionDate ? t.transactionDate.split('T')[0] : '',
            description: t.asset || t.assetDescription || '',
            days_to_disclose: null,
          });
        }

        await new Promise(r => setTimeout(r, 250));
      } catch (err) {
        console.error(`Congress trades error ${symbol}:`, err.message);
      }
    }

    if (allRecords.length > 0) {
      await supabase.from('congress_trades').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      for (let i = 0; i < allRecords.length; i += 100) {
        await supabase.from('congress_trades').insert(allRecords.slice(i, i + 100));
      }
    }

    return res.status(200).json({
      success: true,
      count: allRecords.length,
      symbols_checked: watchlist.length,
      started_at,
      completed_at: new Date().toISOString(),
    });

  } catch (error) {
    console.error('fetchCongressTrades error:', error);
    return res.status(500).json({ error: error.message });
  }
}
