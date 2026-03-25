// api/sendPushNotification.js
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const PUSHOVER_USER_KEY = process.env.PUSHOVER_USER_KEY;
const PUSHOVER_APP_TOKEN = process.env.PUSHOVER_APP_TOKEN;

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  try {
    const { title, message, priority = 0, sound = 'pushover', trigger_type, symbol, value } = req.body || {};

    if (!message || !title) {
      return res.status(400).json({ error: 'title and message are required' });
    }

    if (!PUSHOVER_USER_KEY || !PUSHOVER_APP_TOKEN) {
      await supabase.from('notification_logs').insert({
        trigger_type: trigger_type || 'test', title, message, symbol, value,
        delivered_at: new Date().toISOString(), status: 'failed',
        error: 'Pushover keys not configured',
      });
      return res.status(500).json({ error: 'Pushover keys not configured — add PUSHOVER_USER_KEY and PUSHOVER_APP_TOKEN in Vercel environment variables.' });
    }

    const delivered_at = new Date().toISOString();
    const formData = new URLSearchParams();
    formData.append('token', PUSHOVER_APP_TOKEN);
    formData.append('user', PUSHOVER_USER_KEY);
    formData.append('title', title);
    formData.append('message', message);
    formData.append('priority', String(priority));
    formData.append('sound', sound);

    const pushRes = await fetch('https://api.pushover.net/1/messages.json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
      signal: AbortSignal.timeout(10000),
    });

    const result = await pushRes.json().catch(() => ({}));
    const status = pushRes.ok && result.status === 1 ? 'sent' : 'failed';

    await supabase.from('notification_logs').insert({
      trigger_type: trigger_type || 'test', title, message, symbol, value,
      delivered_at, status,
      error: status === 'failed' ? (result.errors?.join(', ') || `HTTP ${pushRes.status}`) : null,
    });

    return res.status(200).json({ success: status === 'sent', status });
  } catch (error) {
    console.error('sendPushNotification error:', error);
    return res.status(500).json({ error: error.message });
  }
}
