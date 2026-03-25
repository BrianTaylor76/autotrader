import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

// ── HELPER FUNCTIONS ──────────────────────────────────────────────────────────

export async function getSettings() {
  const { data, error } = await supabase
    .from('strategy_settings')
    .select('*')
    .order('created_date', { ascending: false })
    .limit(1)
    .single();
  if (error) return null;
  return data;
}

export async function getTradingMode() {
  const { data, error } = await supabase
    .from('trading_mode')
    .select('*')
    .order('activated_at', { ascending: false })
    .limit(1)
    .single();
  if (error) return { mode: 'paper' };
  return data;
}

export async function upsertBySymbol(table, symbol, payload) {
  const { data: existing } = await supabase
    .from(table)
    .select('id')
    .eq('symbol', symbol.toUpperCase())
    .single();

  if (existing) {
    const { data, error } = await supabase
      .from(table)
      .update(payload)
      .eq('id', existing.id)
      .select()
      .single();
    if (error) throw new Error(`Update failed on ${table}: ${error.message}`);
    return data;
  } else {
    const { data, error } = await supabase
      .from(table)
      .insert({ ...payload, symbol: symbol.toUpperCase() })
      .select()
      .single();
    if (error) throw new Error(`Insert failed on ${table}: ${error.message}`);
    return data;
  }
}

export async function sendPush({ title, message, priority = 0, sound = 'pushover', trigger_type, symbol, value }) {
  const delivered_at = new Date().toISOString();
  const PUSHOVER_USER_KEY = process.env.PUSHOVER_USER_KEY;
  const PUSHOVER_APP_TOKEN = process.env.PUSHOVER_APP_TOKEN;

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
    });

    const result = await res.json().catch(() => ({}));
    const status = res.ok && result.status === 1 ? 'sent' : 'failed';

    await supabase.from('notification_logs').insert({
      trigger_type, title, message, symbol, value, delivered_at, status
    }).catch(() => {});

  } catch (e) {
    await supabase.from('notification_logs').insert({
      trigger_type, title, message, symbol, value, delivered_at, status: 'failed', error: e.message
    }).catch(() => {});
  }
}
