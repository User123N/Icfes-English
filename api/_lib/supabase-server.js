import { randomUUID } from 'node:crypto';

export function jsonReply(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(status).json(body);
}

function env(...names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value) return value;
  }
  return '';
}

export function getSupabaseConfig() {
  const url = env('SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL').replace(/\/+$/, '');
  const publicKey = env('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY');
  const adminKey = env('SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY');
  if (!url || !publicKey || !adminKey) throw new Error('Falta configurar Supabase en las variables de entorno de Vercel.');
  return { url, publicKey, adminKey };
}

export async function authenticateTeacher(req, allowedRoles = ['teacher', 'teacher_admin']) {
  const config = getSupabaseConfig();
  const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    const error = new Error('Inicia sesión para continuar.');
    error.status = 401;
    throw error;
  }
  const authResponse = await fetch(config.url + '/auth/v1/user', {
    headers: { apikey: config.publicKey, Authorization: 'Bearer ' + token }
  });
  if (!authResponse.ok) {
    const error = new Error('La sesión expiró o no es válida.');
    error.status = 401;
    throw error;
  }
  const user = await authResponse.json();
  const profiles = await dbRequest(config, '/rest/v1/profiles?id=eq.' + encodeURIComponent(user.id) + '&select=id,role,display_name', 'GET');
  const profile = Array.isArray(profiles) ? profiles[0] : null;
  if (!profile || !allowedRoles.includes(profile.role)) {
    const error = new Error('Tu cuenta no tiene permisos para esta acción.');
    error.status = 403;
    throw error;
  }
  return { ...config, token, user, profile };
}

export async function dbRequest(config, path, method = 'GET', body, prefer = 'return=representation') {
  const response = await fetch(config.url + path, {
    method,
    headers: {
      apikey: config.adminKey,
      Authorization: 'Bearer ' + config.adminKey,
      'Content-Type': 'application/json',
      Prefer: prefer
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
  const raw = await response.text();
  let data = null;
  if (raw) {
    try { data = JSON.parse(raw); }
    catch { data = { message: raw.slice(0, 500) }; }
  }
  if (!response.ok) {
    const error = new Error(data?.message || data?.msg || data?.error_description || data?.error || 'Supabase devolvió ' + response.status + '.');
    error.status = response.status;
    throw error;
  }
  return data;
}

export async function verifyOwnedExam(ctx, examId) {
  const rows = await dbRequest(
    ctx,
    '/rest/v1/exams?id=eq.' + encodeURIComponent(examId) + '&owner_id=eq.' + encodeURIComponent(ctx.user.id) + '&select=id,title,status'
  );
  if (!Array.isArray(rows) || !rows.length) {
    const error = new Error('La prueba seleccionada no existe o no pertenece a tu cuenta.');
    error.status = 404;
    throw error;
  }
  return rows[0];
}

export async function writeAudit(ctx, action, entityType, entityId, details = {}) {
  try {
    await dbRequest(ctx, '/rest/v1/audit_logs', 'POST', {
      actor_id: ctx.user.id,
      action: String(action).slice(0, 100),
      entity_type: String(entityType).slice(0, 80),
      entity_id: entityId == null ? null : String(entityId).slice(0, 160),
      details
    });
  } catch (error) {
    console.error('Audit write failed:', error.message);
  }
}

export function uuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''));
}

export function newId() {
  return randomUUID();
}
