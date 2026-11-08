// Vercel serverless function: /api/public-config
// Only returns public Supabase client configuration. Never expose service-role or AI provider secrets.
function send(res, status, body) {
  res.status(status).setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.status(status).json(body);
}
export default function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { error: 'Usa GET para consultar la configuración pública.' });
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const supabasePublishableKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  if (!supabaseUrl || !supabasePublishableKey) {
    return send(res, 503, { error: 'Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en las variables de entorno de Vercel.' });
  }
  try {
    const parsed = new URL(supabaseUrl);
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.supabase.co')) {
      return send(res, 503, { error: 'La URL de Supabase debe ser una URL HTTPS válida del proyecto.' });
    }
  } catch {
    return send(res, 503, { error: 'NEXT_PUBLIC_SUPABASE_URL no es una URL válida.' });
  }
  return send(res, 200, {
    supabaseUrl,
    supabasePublishableKey,
    aiGenerationConfigured: Boolean((process.env.AI_PROVIDER_API_KEY || '').trim())
  });
}
