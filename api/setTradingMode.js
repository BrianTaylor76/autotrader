// api/setTradingMode.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const LIVE_KEY = process.env.ALPACA_LIVE_API_KEY;
const LIVE_SECRET = process.env.ALPACA_LIVE_API_SECRET;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const { mode } = req.body || {};
    if (!['paper', 'live'].includes(mode)) {
      return res.status(400).json({ error: 'Invalid mode. Must be paper or live.' });
    }

    if (mode === 'live') {
      if (!LIVE_KEY || !LIVE_SECRET) {
        return res.status(400).json({ error: 'Live API keys not configured. Set ALPACA_LIVE_API_KEY and ALPACA_LIVE_API_SECRET in Vercel environment variables.' });
      }
    }

    // If switching to paper, cancel all open live orders
    let cancelledOrders = 0;
    if (mode === 'paper' && LIVE_KEY && LIVE_SECRET) {
      try {
        const cancelRes = await fetch('https://api.alpaca.markets/v2/orders', {
          method: 'DELETE',
          headers: { 'APCA-API-KEY-ID': LIVE_KEY, 'APCA-API-SECRET-KEY': LIVE_SECRET, 'Content-Type': 'application/json' },
        });
        if (cancelRes.ok) {
          const cancelled = await cancelRes.json().catch(() => []);
          cancelledOrders = Array.isArray(cancelled) ? cancelled.length : 0;
        }
      } catch (_) { /* best effort */ }
    }

    // Delete old records and create new one
    await supabase.from('trading_mode').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    const { data, error } = await supabase.from('trading_mode').insert({
      mode,
      activated_at: new Date().toISOString(),
      activated_by: 'user',
    }).select().single();

    if (error) throw new Error(error.message);
    return res.status(200).json({ success: true, mode, cancelled_orders: cancelledOrders });
  } catch (error) {
    console.error('setTradingMode error:', error);
    return res.status(500).json({ error: error.message });
  }
}
