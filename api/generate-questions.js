// Vercel serverless endpoint: generate ICFES-style English questions securely.
function reply(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(status).json(body);
}
function getEnv(...names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}
function validateQuestion(q, part) {
  if (!q || typeof q !== 'object' || Array.isArray(q)) return null;
  if (typeof q.question !== 'string' || !q.question.trim() || q.question.length > 3000) return null;
  if (!Array.isArray(q.options) || q.options.length !== 4 ||
      q.options.some(option => typeof option !== 'string' || !option.trim() || option.length > 1200)) return null;
  if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) return null;
  if (typeof q.explanation !== 'string' || !q.explanation.trim() || q.explanation.length > 3000) return null;
  return { part, question: q.question.trim(), options: q.options.map(x => x.trim()), correct: q.correct, explanation: q.explanation.trim() };
}
export default async function handler(req, res) {
  if (req.method !== 'POST') return reply(res, 405, { error: 'Usa POST para generar preguntas.' });
  const url = getEnv('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL').replace(/\/+$/, '');
  const publicKey = getEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY');
  const serviceKey = getEnv('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY');
  const aiKey = getEnv('AI_PROVIDER_API_KEY');
  if (!url || !publicKey || !serviceKey) return reply(res, 503, { error: 'Falta configurar la conexión segura de Supabase en Vercel.' });
  if (!aiKey) return reply(res, 503, { error: 'Falta AI_PROVIDER_API_KEY en las variables de entorno de Vercel.' });
  const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return reply(res, 401, { error: 'Inicia sesión como docente autorizado.' });
  const body = typeof req.body === 'string' ? (() => { try { return JSON.parse(req.body); } catch { return null; } })() : req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(res, 400, { error: 'El cuerpo de la solicitud no es válido.' });
  const source = typeof body.text === 'string' ? body.text.trim() : '';
  const count = Number(body.count ?? 10);
  const part = Number(body.part ?? 1);
  if (source.length < 80) return reply(res, 400, { error: 'El material debe contener al menos 80 caracteres.' });
  if (source.length > 90000) return reply(res, 413, { error: 'El material supera el límite de 90.000 caracteres.' });
  if (!Number.isInteger(count) || count < 1 || count > 20) return reply(res, 400, { error: 'La cantidad debe estar entre 1 y 20 preguntas.' });
  if (!Number.isInteger(part) || part < 1 || part > 7) return reply(res, 400, { error: 'La parte debe estar entre 1 y 7.' });
  try {
    const auth = await fetch(url + '/auth/v1/user', { headers: { apikey: publicKey, Authorization: 'Bearer ' + token } });
    if (!auth.ok) return reply(res, 401, { error: 'La sesión expiró o no es válida.' });
    const user = await auth.json();
    const profileResponse = await fetch(url + '/rest/v1/profiles?id=eq.' + encodeURIComponent(user.id) + '&select=role', {
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey }
    });
    if (!profileResponse.ok) return reply(res, 502, { error: 'No se pudo verificar el perfil docente.' });
    const profiles = await profileResponse.json();
    if (!Array.isArray(profiles) || !['teacher', 'teacher_admin'].includes(profiles[0]?.role)) {
      return reply(res, 403, { error: 'Solo una cuenta docente autorizada puede generar preguntas.' });
    }
    const requestLimit = Math.max(1, Math.min(1000, Number.parseInt(getEnv('AI_GENERATION_DAILY_REQUEST_LIMIT') || '20', 10) || 20));
    const questionLimit = Math.max(1, Math.min(10000, Number.parseInt(getEnv('AI_GENERATION_DAILY_QUESTION_LIMIT') || '100', 10) || 100));
    const quotaResponse = await fetch(url + '/rest/v1/rpc/consume_ai_generation_quota', {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: 'Bearer ' + serviceKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_user_id: user.id,
        p_requested_questions: count,
        p_request_limit: requestLimit,
        p_question_limit: questionLimit
      })
    });
    const quotaRows = await quotaResponse.json().catch(() => []);
    if (!quotaResponse.ok) {
      console.error('AI quota check failed:', quotaRows?.message || quotaRows?.hint || quotaResponse.status);
      return reply(res, 503, { error: 'No se pudo comprobar tu cuota diaria de IA. Inténtalo más tarde.' });
    }
    const quota = Array.isArray(quotaRows) ? quotaRows[0] : quotaRows;
    if (!quota || quota.allowed !== true) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((new Date(quota?.reset_at || Date.now() + 3600000).getTime() - Date.now()) / 1000))));
      return reply(res, 429, {
        error: 'Alcanzaste el límite diario del generador IA. Podrás volver a generar preguntas cuando se restablezca tu cuota.',
        quota: {
          requests_used: Number(quota?.requests_used || 0),
          questions_used: Number(quota?.questions_used || 0),
          requests_remaining: Number(quota?.requests_remaining || 0),
          questions_remaining: Number(quota?.questions_remaining || 0),
          reset_at: quota?.reset_at || null
        }
      });
    }
    const endpoint = getEnv('AI_API_URL') || 'https://api.openai.com/v1/chat/completions';
    let parsed;
    try { parsed = new URL(endpoint); } catch { return reply(res, 500, { error: 'AI_API_URL no es una URL válida.' }); }
    if (parsed.protocol !== 'https:' || (parsed.hostname !== 'api.openai.com' && process.env.ALLOW_CUSTOM_AI_API_URL !== 'true')) {
      return reply(res, 500, { error: 'AI_API_URL debe utilizar HTTPS y el proveedor permitido.' });
    }
    const model = getEnv('AI_MODEL') || 'gpt-4o-mini';
    const system = 'Create high-quality original English Saber 11/ICFES practice questions from source material. Return ONLY valid JSON in the shape {"questions":[{"question":"...","options":["...","...","...","..."],"correct":0,"explanation":"..."}]}. Generate exactly ' + count + ' questions. Each must have four non-empty options, one defensible correct answer and a zero-based correct index from 0 to 3. Write questions and options in English; explanations may be in concise Spanish. Stay faithful to the source, avoid duplicates, ambiguity and unsupported facts. Adapt the style to exam part ' + part + '.';
    const completion = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + aiKey, 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(45000),
      body: JSON.stringify({
        model, temperature: 0.3, response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, { role: 'user', content: 'Part: ' + part + '\nSource material:\n\n' + source }]
      })
    });
    const data = await completion.json().catch(() => ({}));
    if (!completion.ok) {
      if (completion.status === 429) return reply(res, 429, { error: 'El proveedor limitó las solicitudes. Inténtalo más tarde.' });
      if ([401, 403].includes(completion.status)) return reply(res, 502, { error: 'El proveedor rechazó la credencial o el modelo configurado.' });
      return reply(res, 502, { error: 'El proveedor de IA no pudo generar preguntas. Revisa AI_MODEL y AI_API_URL.' });
    }
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return reply(res, 502, { error: 'El proveedor no devolvió contenido JSON.' });
    let parsedOutput;
    try { parsedOutput = JSON.parse(content); } catch { return reply(res, 502, { error: 'La respuesta de IA no era JSON válido.' }); }
    if (!Array.isArray(parsedOutput.questions) || parsedOutput.questions.length !== count) {
      return reply(res, 502, { error: 'La IA no devolvió la cantidad exacta solicitada. Intenta con menos preguntas.' });
    }
    const questions = parsedOutput.questions.map(q => validateQuestion(q, part));
    if (questions.some(q => !q)) return reply(res, 502, { error: 'La respuesta de IA no superó la validación. No se guardó ningún contenido.' });
    return reply(res, 200, { questions });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return reply(res, 504, { error: 'La generación tardó demasiado. Prueba con menos texto o menos preguntas.' });
    console.error('generate-questions:', error?.message || error);
    return reply(res, 502, { error: 'No se pudo conectar con el proveedor de IA.' });
  }
}
