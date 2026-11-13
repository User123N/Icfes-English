import { authenticateTeacher, dbRequest, jsonReply } from '../lib/supabase-server.js';

function limit(name, fallback, ceiling) {
  const value = Number.parseInt(String(process.env[name] || ''), 10);
  return Number.isFinite(value) && value > 0 ? Math.min(ceiling, value) : fallback;
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return jsonReply(res, 405, { error: 'Usa GET.' });
    }
    const ctx = await authenticateTeacher(req);
    const today = new Date().toISOString().slice(0, 10);
    const rows = await dbRequest(
      ctx,
      '/rest/v1/ai_generation_usage?user_id=eq.' + encodeURIComponent(ctx.user.id)
        + '&usage_date=eq.' + encodeURIComponent(today)
        + '&select=request_count,question_count,updated_at&limit=1'
    );
    const usage = rows?.[0] || { request_count: 0, question_count: 0 };
    const requestLimit = limit('AI_GENERATION_DAILY_REQUEST_LIMIT', 20, 1000);
    const questionLimit = limit('AI_GENERATION_DAILY_QUESTION_LIMIT', 100, 10000);
    return jsonReply(res, 200, {
      usage_date_utc: today,
      timezone: 'UTC',
      requests: {
        used: Number(usage.request_count || 0),
        limit: requestLimit,
        remaining: Math.max(0, requestLimit - Number(usage.request_count || 0))
      },
      questions: {
        used: Number(usage.question_count || 0),
        limit: questionLimit,
        remaining: Math.max(0, questionLimit - Number(usage.question_count || 0))
      },
      resets_at: new Date(Date.UTC(
        Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 1, Number(today.slice(8, 10)) + 1
      )).toISOString()
    });
  } catch (error) {
    console.error('ai-usage:', error.message);
    return jsonReply(res, error.status || 500, { error: error.message || 'No se pudo consultar la cuota IA.' });
  }
}
