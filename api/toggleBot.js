// api/toggleBot.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const { enabled } = req.body || {};

    const { data: settings, error } = await supabase
      .from('strategy_settings')
      .select('*')
      .order('created_date', { ascending: false })
      .limit(1);

    if (error) throw new Error(error.message);

    if (settings && settings.length > 0) {
      const { data: updated, error: updateError } = await supabase
        .from('strategy_settings')
        .update({ bot_enabled: enabled })
        .eq('id', settings[0].id)
        .select()
        .single();
      if (updateError) throw new Error(updateError.message);
      return res.status(200).json({ success: true, bot_enabled: updated.bot_enabled });
    } else {
      const { data: created, error: createError } = await supabase
        .from('strategy_settings')
        .insert({
          bot_enabled: enabled,
          watchlist: ['SPY', 'QQQ'],
          max_per_trade: 500,
          daily_loss_limit: 200,
          fast_ma_period: 5,
          slow_ma_period: 13,
          strategy_mode: 'simple',
        })
        .select()
        .single();
      if (createError) throw new Error(createError.message);
      return res.status(200).json({ success: true, bot_enabled: created.bot_enabled });
    }
  } catch (error) {
    console.error('toggleBot error:', error);
    return res.status(500).json({ error: error.message });
  }
}
