import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { enabled } = await req.json();

    // Use service role so it works regardless of who is viewing the public app
    const settings = await base44.asServiceRole.entities.StrategySettings.list('-created_date', 1);

    if (settings && settings.length > 0) {
      const updated = await base44.asServiceRole.entities.StrategySettings.update(settings[0].id, {
        bot_enabled: enabled,
      });
      return Response.json({ success: true, bot_enabled: updated.bot_enabled });
    } else {
      // No settings record exists yet — create defaults
      const created = await base44.asServiceRole.entities.StrategySettings.create({
        bot_enabled: enabled,
        watchlist: ['SPY', 'QQQ', 'AAPL', 'TSLA'],
        max_per_trade: 500,
        daily_loss_limit: 200,
        fast_ma_period: 5,
        slow_ma_period: 13,
        strategy_mode: 'simple',
      });
      return Response.json({ success: true, bot_enabled: created.bot_enabled });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});