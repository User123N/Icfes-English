import { authenticateTeacher, dbRequest, jsonReply, writeAudit } from './_lib/supabase-server.js';

function bodyOf(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch {} }
  return {};
}

export default async function handler(req, res) {
  try {
    const ctx = await authenticateTeacher(req, ['teacher_admin']);
    if (req.method === 'GET') {
      const rows = await dbRequest(ctx, '/rest/v1/content_versions?select=id,version_number,label,snapshot,created_at&order=version_number.desc&limit=30');
      return jsonReply(res, 200, { versions: rows || [] });
    }
    if (req.method === 'POST') {
      const body = bodyOf(req);
      const label = String(body.label || 'Instantánea docente').trim().slice(0, 140);
      if (!body.snapshot || typeof body.snapshot !== 'object' || Array.isArray(body.snapshot)) {
        return jsonReply(res, 400, { error: 'La instantánea no tiene un formato válido.' });
      }
      let serialized;
      try { serialized = JSON.stringify(body.snapshot); } catch { return jsonReply(res, 400, { error: 'La instantánea no se puede serializar.' }); }
      if (serialized.length > 3000000) return jsonReply(res, 413, { error: 'La instantánea supera el límite de 3 MB. Reduce imágenes o exporta el banco por separado.' });
      const rows = await dbRequest(ctx, '/rest/v1/content_versions?select=id,version_number,label,snapshot,created_at', 'POST', {
        label, snapshot: body.snapshot, created_by: ctx.user.id
      });
      const version = rows?.[0];
      await writeAudit(ctx, 'content_version_created', 'content_version', version?.id, {
        version_number: version?.version_number, label
      });
      return jsonReply(res, 201, { version });
    }
    res.setHeader('Allow', 'GET, POST');
    return jsonReply(res, 405, { error: 'Método no permitido.' });
  } catch (error) {
    console.error('teacher-versions:', error.message);
    return jsonReply(res, error.status || 500, { error: error.message || 'No se pudo gestionar el historial.' });
  }
}
