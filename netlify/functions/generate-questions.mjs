const json = (statusCode, body, extraHeaders = {}) => ({
  statusCode,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders },
  body: JSON.stringify(body)
});
const fail = (status, message) => json(status, { error: message });
const MAX_TEXT = 90000;
const MAX_COUNT = 20;
const timeoutSignal = (ms) => AbortSignal.timeout(ms);

async function authorize(event) {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_ANONKEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '';
  const auth = event.headers?.authorization || event.headers?.Authorization || '';
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!url || !anonKey) return { error: fail(503, 'La autenticación del servidor no está configurada. Define SUPABASE_URL y SUPABASE_ANON_KEY (o NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) en Netlify.') };
  if (!token || token.length > 8192) return { error: fail(401, 'Inicia sesión con una cuenta docente autorizada.') };
  try {
    const userRes = await fetch(`${url}/auth/v1/user`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` }, signal: timeoutSignal(5000) });
    if (!userRes.ok) return { error: fail(401, 'La sesión no es válida o ha expirado. Inicia sesión de nuevo.') };
    const user = await userRes.json();
    if (!user?.id) return { error: fail(401, 'No se pudo validar la identidad de la sesión.') };
    const profileRes = await fetch(`${url}/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role&limit=1`, { headers: { apikey: anonKey, Authorization: `Bearer ${token}` }, signal: timeoutSignal(5000) });
    if (!profileRes.ok) return { error: fail(403, 'No fue posible verificar los permisos del docente.') };
    const profiles = await profileRes.json();
    if (!Array.isArray(profiles) || profiles.length !== 1 || profiles[0].id !== user.id || profiles[0].role !== 'teacher_admin') return { error: fail(403, 'Esta cuenta no tiene el rol docente autorizado.') };
    return { user };
  } catch {
    return { error: fail(503, 'No se pudo validar la sesión con Supabase. Intenta de nuevo más tarde.') };
  }
}

function validateQuestion(q, part) {
  if (!q || typeof q !== 'object' || Array.isArray(q)) return null;
  if (typeof q.question !== 'string' || !q.question.trim() || q.question.length > 3000) return null;
  if (!Array.isArray(q.options) || q.options.length !== 4 || q.options.some(o => typeof o !== 'string' || !o.trim() || o.length > 1200)) return null;
  if (!Number.isInteger(q.correct) || q.correct < 0 || q.correct > 3) return null;
  if (typeof q.explanation !== 'string' || !q.explanation.trim() || q.explanation.length > 3000) return null;
  return { part, question: q.question.trim(), options: q.options.map(o => o.trim()), correct: q.correct, explanation: q.explanation.trim() };
}

export async function handler(event) {
  if (event.httpMethod !== 'POST') return fail(405, 'Usa POST para generar preguntas.');
  const auth = await authorize(event);
  if (auth.error) return auth.error;
  const apiKey = process.env.AI_PROVIDER_API_KEY;
  if (!apiKey) return fail(503, 'Falta configurar AI_PROVIDER_API_KEY en las variables de entorno de Netlify.');
  const length = (event.body || '').length;
  if (length > 125000) return fail(413, 'La solicitud supera el tamaño permitido.');
  let input;
  try { input = JSON.parse(event.body || '{}'); } catch { return fail(400, 'El cuerpo de la solicitud no es JSON válido.'); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return fail(400, 'El cuerpo debe ser un objeto JSON.');
  const text = typeof input.text === 'string' ? input.text.trim() : '';
  const count = Number(input.count ?? 10);
  const part = Number(input.part ?? 1);
  if (text.length < 80) return fail(400, 'El material debe contener al menos 80 caracteres.');
  if (text.length > MAX_TEXT) return fail(413, 'El material supera el límite de 90.000 caracteres.');
  if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) return fail(400, 'La cantidad debe ser un entero entre 1 y 20.');
  if (!Number.isInteger(part) || part < 1 || part > 7) return fail(400, 'La parte del examen debe ser un entero entre 1 y 7.');
  const model = (process.env.AI_MODEL || 'gpt-4o-mini').trim();
  const apiUrl = process.env.AI_API_URL || 'https://api.openai.com/v1/chat/completions';
  let parsedUrl;
  try { parsedUrl = new URL(apiUrl); } catch { return fail(500, 'AI_API_URL no es una URL válida.'); }
  if (parsedUrl.protocol !== 'https:' || parsedUrl.hostname !== 'api.openai.com' && !process.env.ALLOW_CUSTOM_AI_API_URL) return fail(500, 'AI_API_URL debe usar HTTPS y el endpoint oficial de OpenAI, salvo que se habilite explícitamente un proveedor compatible.');
  const system = `You create high-quality English Saber 11/ICFES practice questions from source material. Return ONLY valid JSON: {"questions":[{"question":"...","options":["...","...","...","..."],"correct":0,"explanation":"..."}]}. Generate exactly ${count} questions. Each question must have exactly four non-empty options, one defensible correct answer, and correct is a zero-based integer 0-3. Write questions/options in English; explanations may be concise Spanish. Base questions on the source and avoid unsupported facts, duplicates, ambiguous options and trick questions. Adapt style to exam part ${part}.`;
  try {
    const response = await fetch(apiUrl, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      signal: timeoutSignal(45000),
      body: JSON.stringify({ model, temperature: 0.3, response_format: { type: 'json_object' }, messages: [
        { role: 'system', content: system },
        { role: 'user', content: `Parte del examen: ${part}. Cantidad solicitada: ${count}. Material fuente:\n\n${text}` }
      ] })
    });
    const raw = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 429) return fail(429, 'El proveedor limitó las solicitudes. Espera un momento e inténtalo de nuevo.');
      if (response.status === 401 || response.status === 403) return fail(502, 'El proveedor rechazó la credencial o no tiene acceso al modelo configurado. Revisa las variables de Netlify.');
      return fail(502, 'El proveedor de IA no pudo generar preguntas. Revisa el modelo y la configuración.');
    }
    const content = raw?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') return fail(502, 'El proveedor no devolvió contenido JSON.');
    let data;
    try { data = JSON.parse(content); } catch { return fail(502, 'La respuesta de IA no era JSON válido. Intenta otra vez.'); }
    if (!Array.isArray(data.questions) || data.questions.length !== count) return fail(502, 'La IA no devolvió la cantidad exacta de preguntas solicitada. Intenta con otro material.');
    const questions = data.questions.map(q => validateQuestion(q, part));
    if (questions.some(q => !q)) return fail(502, 'La respuesta de IA no superó la validación de preguntas y opciones. No se guardó ningún contenido.');
    return json(200, { questions });
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') return fail(504, 'La generación tardó demasiado. Intenta de nuevo con menos texto o preguntas.');
    return fail(502, 'No se pudo conectar con el proveedor de IA. Intenta de nuevo más tarde.');
  }
}
