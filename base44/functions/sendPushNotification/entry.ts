import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const PUSHOVER_USER_KEY = Deno.env.get('PUSHOVER_USER_KEY');
const PUSHOVER_APP_TOKEN = Deno.env.get('PUSHOVER_APP_TOKEN');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json();
    const { title, message, priority = 0, sound = 'pushover', trigger_type, symbol, value } = body;

    if (!message || !title) {
      return Response.json({ error: 'title and message are required' }, { status: 400 });
    }

    const delivered_at = new Date().toISOString();

    // Check notification settings - load from StrategySettings
    const settingsList = await base44.asServiceRole.entities.StrategySettings.list('-created_date', 1);
    const settings = settingsList[0] || {};
    const notifEnabled = settings.notifications_enabled !== false;
    const triggerEnabled = trigger_type ? settings[`notif_${trigger_type}`] !== false : true;

    if (!notifEnabled || !triggerEnabled) {
      return Response.json({ skipped: true, reason: 'Notifications disabled for this trigger' });
    }

    if (!PUSHOVER_USER_KEY || !PUSHOVER_APP_TOKEN) {
      await base44.asServiceRole.entities.NotificationLog.create({
        trigger_type: trigger_type || 'test',
        title,
        message,
        symbol,
        value,
        delivered_at,
        status: 'failed',
        error: 'Missing PUSHOVER_USER_KEY or PUSHOVER_APP_TOKEN',
      });
      return Response.json({ error: 'Pushover credentials not configured' }, { status: 500 });
    }

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
      signal: AbortSignal.timeout(10000),
    });

    const result = await res.json().catch(() => ({}));
    const status = res.ok && result.status === 1 ? 'sent' : 'failed';

    await base44.asServiceRole.entities.NotificationLog.create({
      trigger_type: trigger_type || 'test',
      title,
      message,
      symbol,
      value,
      delivered_at,
      status,
      error: status === 'failed' ? (result.errors?.join(', ') || `HTTP ${res.status}`) : undefined,
    });

    return Response.json({ success: status === 'sent', status, pushover_response: result });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});