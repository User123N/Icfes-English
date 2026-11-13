import { jsonReply } from '../lib/supabase-server.js';

function present(...names) {
  return names.some(name => String(process.env[name] || '').trim().length > 0);
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return jsonReply(res, 405, { error: 'Usa GET.' });
  }
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const publicKey = present('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY');
  const serverKey = present('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY');
  const aiKey = present('AI_PROVIDER_API_KEY');
  let supabaseReachable = false;
  if (url && publicKey) {
    try {
      const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
      const response = await fetch(url + '/auth/v1/settings', {
        headers: { apikey: key },
        signal: AbortSignal.timeout(5000)
      });
      supabaseReachable = response.ok;
    } catch {
      supabaseReachable = false;
    }
  }
  const checks = {
    supabase_url: Boolean(url),
    public_key: publicKey,
    server_key: serverKey,
    supabase_reachable: supabaseReachable,
    ai_provider_key: aiKey
  };
  const coreReady = checks.supabase_url && checks.public_key && checks.server_key && checks.supabase_reachable;
  return jsonReply(res, coreReady ? 200 : 503, {
    status: coreReady ? (aiKey ? 'ready' : 'degraded') : 'not_ready',
    core_ready: coreReady,
    ai_ready: aiKey,
    checks,
    checked_at: new Date().toISOString()
  });
}
