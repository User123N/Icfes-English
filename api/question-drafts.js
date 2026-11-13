import { authenticateTeacher, dbRequest, jsonReply, uuid, verifyOwnedExam, writeAudit } from './_lib/supabase-server.js';

function bodyOf(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch {} }
  return {};
}
function validateDraft(q) {
  if (!q || typeof q !== 'object') return null;
  const part = Number(q.part);
  const question = String(q.question || '').trim();
  const options = Array.isArray(q.options) ? q.options.map(x => String(x ?? '').trim()) : [];
  const correct = Number(q.correct ?? q.correct_index);
  const explanation = String(q.explanation || '').trim();
  if (!Number.isInteger(part) || part < 1 || part > 7) return null;
  if (!question || question.length > 3000) return null;
  if (options.length < 2 || options.length > 4 || options.some(x => !x || x.length > 1200)) return null;
  if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) return null;
  if (explanation.length > 3000) return null;
  return { part, question, options, correct_index: correct, explanation };
}
function queryIds(ids) { return '(' + ids.map(x => '"' + x + '"').join(',') + ')'; }

export default async function handler(req, res) {
  try {
    const ctx = await authenticateTeacher(req);
    const url = new URL(req.url, 'https://icfes-english.invalid');
    if (req.method === 'GET') {
      const examId = url.searchParams.get('exam_id');
      let examFilter = '';
      if (examId) {
        if (!uuid(examId)) return jsonReply(res, 400, { error: 'El identificador de la prueba no es válido.' });
        await verifyOwnedExam(ctx, examId);
        examFilter = '&exam_id=eq.' + encodeURIComponent(examId);
      } else {
        const exams = await dbRequest(ctx, '/rest/v1/exams?owner_id=eq.' + encodeURIComponent(ctx.user.id) + '&select=id');
        const ids = (exams || []).map(x => x.id);
        if (!ids.length) return jsonReply(res, 200, { drafts: [] });
        examFilter = '&exam_id=in.' + encodeURIComponent(queryIds(ids));
      }
      const status = url.searchParams.get('status') || 'pending';
      const rows = await dbRequest(ctx, '/rest/v1/question_drafts?created_by=eq.' + encodeURIComponent(ctx.user.id) + examFilter + '&status=eq.' + encodeURIComponent(status) + '&select=id,batch_id,exam_id,part,question,options,correct_index,explanation,status,created_at&order=created_at.desc&limit=200');
      return jsonReply(res, 200, { drafts: rows || [] });
    }

    const body = bodyOf(req);
    if (req.method === 'POST') {
      if (body.action !== 'save' || !uuid(body.exam_id) || !Array.isArray(body.questions) || body.questions.length < 1 || body.questions.length > 50) {
        return jsonReply(res, 400, { error: 'Solicitud de borradores inválida.' });
      }
      await verifyOwnedExam(ctx, body.exam_id);
      const source = String(body.source_material || '').trim();
      if (source.length > 90000) return jsonReply(res, 413, { error: 'El material fuente supera el límite permitido.' });
      const valid = body.questions.map(validateDraft);
      if (valid.some(x => !x)) return jsonReply(res, 400, { error: 'Una o más preguntas no cumplen la validación.' });
      const batchId = crypto.randomUUID();
      const rows = valid.map(q => ({
        batch_id: batchId,
        exam_id: body.exam_id,
        part: q.part,
        question: q.question,
        options: q.options,
        correct_index: q.correct_index,
        explanation: q.explanation,
        source_material: source || null,
        status: 'pending',
        created_by: ctx.user.id
      }));
      const saved = await dbRequest(ctx, '/rest/v1/question_drafts?select=id,batch_id,exam_id,part,question,options,correct_index,explanation,status,created_at', 'POST', rows);
      await writeAudit(ctx, 'ai_drafts_created', 'question_draft_batch', batchId, { count: rows.length, exam_id: body.exam_id });
      return jsonReply(res, 201, { drafts: saved || [], batch_id: batchId });
    }

    if (req.method === 'PATCH') {
      const action = String(body.action || '');
      if (action === 'update') {
        if (!uuid(body.id)) return jsonReply(res, 400, { error: 'El borrador seleccionado no es válido.' });
        const draftRows = await dbRequest(ctx, '/rest/v1/question_drafts?id=eq.' + encodeURIComponent(body.id) + '&created_by=eq.' + encodeURIComponent(ctx.user.id) + '&select=id,exam_id,status');
        const draft = draftRows?.[0];
        if (!draft || draft.status !== 'pending') return jsonReply(res, 404, { error: 'El borrador ya no está pendiente o no existe.' });
        if (draft.exam_id) await verifyOwnedExam(ctx, draft.exam_id);
        const clean = validateDraft(body.question);
        if (!clean) return jsonReply(res, 400, { error: 'Revisa el enunciado, las opciones y la respuesta correcta.' });
        const updated = await dbRequest(ctx, '/rest/v1/question_drafts?id=eq.' + encodeURIComponent(body.id) + '&created_by=eq.' + encodeURIComponent(ctx.user.id) + '&select=id,part,question,options,correct_index,explanation,status', 'PATCH', {
          part: clean.part, question: clean.question, options: clean.options,
          correct_index: clean.correct_index, explanation: clean.explanation
        });
        return jsonReply(res, 200, { draft: updated?.[0] || null });
      }
      if (action === 'review') {
        const decision = body.decision;
        const ids = [...new Set(Array.isArray(body.ids) ? body.ids : [])].filter(uuid);
        if (!['approved', 'rejected'].includes(decision) || !ids.length || ids.length > 50) {
          return jsonReply(res, 400, { error: 'Selecciona entre 1 y 50 borradores para revisar.' });
        }
        const rows = await dbRequest(ctx, '/rest/v1/question_drafts?id=in.' + encodeURIComponent(queryIds(ids)) + '&created_by=eq.' + encodeURIComponent(ctx.user.id) + '&status=eq.pending&select=id,batch_id,exam_id,part,question,options,correct_index,explanation,source_material');
        if (!rows?.length) return jsonReply(res, 404, { error: 'No hay borradores pendientes en esa selección.' });
        const examIds = [...new Set(rows.map(x => x.exam_id).filter(Boolean))];
        for (const examId of examIds) await verifyOwnedExam(ctx, examId);
        let approvedQuestions = [];
        if (decision === 'approved') {
          const questions = rows.map(d => ({
            client_id: 'ai-' + d.id,
            owner_id: ctx.user.id,
            created_by: ctx.user.id,
            updated_by: ctx.user.id,
            exam_id: d.exam_id,
            part: d.part,
            question: d.question,
            question_type: 'text',
            options: d.options,
            correct_index: d.correct_index,
            explanation: d.explanation || '',
            source_material: d.source_material || null,
            status: 'draft'
          }));
          approvedQuestions = await dbRequest(ctx,
            '/rest/v1/questions?on_conflict=owner_id,exam_id,client_id&select=id,client_id,owner_id,exam_id,part,question,options,correct_index,explanation,status',
            'POST', questions, 'resolution=merge-duplicates,return=representation');
        }
        const now = new Date().toISOString();
        await dbRequest(ctx, '/rest/v1/question_drafts?id=in.' + encodeURIComponent(queryIds(rows.map(x => x.id))) + '&created_by=eq.' + encodeURIComponent(ctx.user.id), 'PATCH', {
          status: decision, reviewed_at: now
        });
        await writeAudit(ctx, decision === 'approved' ? 'ai_drafts_approved' : 'ai_drafts_rejected', 'question_draft_batch', rows[0].batch_id, {
          count: rows.length, exam_ids: examIds, resulting_question_count: approvedQuestions.length
        });
        return jsonReply(res, 200, { decision, reviewed: rows.length, questions: approvedQuestions || [] });
      }
      return jsonReply(res, 400, { error: 'Acción de revisión desconocida.' });
    }
    res.setHeader('Allow', 'GET, POST, PATCH');
    return jsonReply(res, 405, { error: 'Método no permitido.' });
  } catch (error) {
    console.error('question-drafts:', error.message);
    return jsonReply(res, error.status || 500, { error: error.message || 'No se pudo procesar el borrador.' });
  }
}
