const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer'
  },
  body: JSON.stringify(body)
});

export async function handler(event) {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Usa GET para consultar la configuración pública.' });
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '').trim().replace(/\/$/, '');
  const supabasePublishableKey = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
  if (!supabaseUrl || !supabasePublishableKey) {
    return json(503, { error: 'Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en las variables de entorno de Netlify.' });
  }
  try {
    const parsed = new URL(supabaseUrl);
    if (parsed.protocol !== 'https:' || !parsed.hostname.endsWith('.supabase.co')) {
      return json(503, { error: 'La URL de Supabase debe ser una URL HTTPS válida del proyecto.' });
    }
  } catch {
    return json(503, { error: 'NEXT_PUBLIC_SUPABASE_URL no es una URL válida.' });
  }
  return json(200, { supabaseUrl, supabasePublishableKey, aiGenerationConfigured: Boolean((process.env.AI_PROVIDER_API_KEY || '').trim()) });
}
