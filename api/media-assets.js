import { authenticateTeacher, dbRequest, jsonReply, verifyOwnedExam, writeAudit, newId } from '../lib/supabase-server.js';

function bodyOf(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch {} }
  return {};
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return jsonReply(res, 405, { error: 'Usa POST.' }); }
    const ctx = await authenticateTeacher(req, ['teacher_admin']);
    const body = bodyOf(req);
    if (!body.exam_id) return jsonReply(res, 400, { error: 'Selecciona una prueba para asociar la imagen.' });
    await verifyOwnedExam(ctx, body.exam_id);
    const dataUrl = String(body.data_url || '');
    const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) return jsonReply(res, 400, { error: 'Formato no permitido. Usa JPG, PNG, WEBP o GIF.' });
    const mime = match[1];
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > 4 * 1024 * 1024) return jsonReply(res, 413, { error: 'La imagen debe pesar como máximo 4 MB.' });
    const extension = ({ 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' })[mime];
    const fileName = String(body.file_name || ('pregunta.' + extension)).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
    const altText = String(body.alt_text || '').trim().slice(0, 300);
    const storagePath = ctx.user.id + '/' + body.exam_id + '/' + newId() + '.' + extension;
    const uploadUrl = ctx.url + '/storage/v1/object/question-media/' + storagePath.split('/').map(encodeURIComponent).join('/');
    const upload = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        apikey: ctx.adminKey,
        Authorization: 'Bearer ' + ctx.adminKey,
        'Content-Type': mime,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'x-upsert': 'false'
      },
      body: bytes
    });
    const uploadBody = await upload.json().catch(() => ({}));
    if (!upload.ok) return jsonReply(res, upload.status >= 500 ? 502 : upload.status, { error: uploadBody.message || uploadBody.error || 'No se pudo subir la imagen a Supabase Storage.' });
    const saved = await dbRequest(ctx, '/rest/v1/media_assets?select=id,storage_path,file_name,mime_type,size_bytes,alt_text,created_at', 'POST', {
      storage_path: storagePath,
      file_name: fileName,
      mime_type: mime,
      size_bytes: bytes.length,
      alt_text: altText,
      uploaded_by: ctx.user.id
    });
    const publicUrl = ctx.url + '/storage/v1/object/public/question-media/' + storagePath.split('/').map(encodeURIComponent).join('/');
    await writeAudit(ctx, 'question_media_uploaded', 'media_asset', saved?.[0]?.id, { exam_id: body.exam_id, size_bytes: bytes.length, mime_type: mime });
    return jsonReply(res, 201, { asset: saved?.[0] || null, image_path: publicUrl, storage_path: storagePath });
  } catch (error) {
    console.error('media-assets:', error.message);
    return jsonReply(res, error.status || 500, { error: error.message || 'No se pudo guardar la imagen.' });
  }
}
