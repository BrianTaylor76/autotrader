import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const LIVE_KEY = Deno.env.get('ALPACA_LIVE_API_KEY');
const LIVE_SECRET = Deno.env.get('ALPACA_LIVE_API_SECRET');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { mode } = await req.json();
    if (!['paper', 'live'].includes(mode)) {
      return Response.json({ error: 'Invalid mode' }, { status: 400 });
    }

    // If switching to live, verify live credentials are set
    if (mode === 'live') {
      if (!LIVE_KEY || !LIVE_SECRET) {
        return Response.json({ error: 'Live API keys not configured. Set ALPACA_LIVE_API_KEY and ALPACA_LIVE_API_SECRET in environment variables.' }, { status: 400 });
      }
    }

    // If switching to paper, cancel all open live orders
    let cancelledOrders = 0;
    if (mode === 'paper' && LIVE_KEY && LIVE_SECRET) {
      try {
        const liveHeaders = {
          'APCA-API-KEY-ID': LIVE_KEY,
          'APCA-API-SECRET-KEY': LIVE_SECRET,
          'Content-Type': 'application/json',
        };
        const res = await fetch('https://api.alpaca.markets/v2/orders', {
          method: 'DELETE',
          headers: liveHeaders,
        });
        if (res.ok) {
          const cancelled = await res.json().catch(() => []);
          cancelledOrders = Array.isArray(cancelled) ? cancelled.length : 0;
        }
      } catch (_) {
        // best effort cancellation
      }
    }

    // Delete old TradingMode records, create new one
    const existing = await base44.asServiceRole.entities.TradingMode.list('-activated_at', 10);
    for (const rec of existing) {
      await base44.asServiceRole.entities.TradingMode.delete(rec.id).catch(() => {});
    }

    await base44.asServiceRole.entities.TradingMode.create({
      mode,
      activated_at: new Date().toISOString(),
      activated_by: user.email,
    });

    return Response.json({ success: true, mode, cancelled_orders: cancelledOrders });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});