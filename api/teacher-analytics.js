import { authenticateTeacher, dbRequest, jsonReply } from '../lib/supabase-server.js';

function inFilter(ids) { return '(' + ids.map(id => '"' + id + '"').join(',') + ')'; }
function safeAverage(values) { return values.length ? Math.round(values.reduce((a,b)=>a+b,0) / values.length * 10) / 10 : null; }

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return jsonReply(res, 405, { error: 'Usa GET.' }); }
    const ctx = await authenticateTeacher(req);
    const url = new URL(req.url, 'https://icfes-english.invalid');
    const days = Math.min(90, Math.max(7, Number(url.searchParams.get('days') || 30)));
    const since = new Date(Date.now() - days * 86400000).toISOString();
    const exams = await dbRequest(ctx, '/rest/v1/exams?owner_id=eq.' + encodeURIComponent(ctx.user.id) + '&select=id,title,status,created_at&order=created_at.desc');
    const examIds = (exams || []).map(x => x.id);
    if (!examIds.length) {
      return jsonReply(res, 200, { range_days: days, summary: { exams: 0, published_exams: 0, questions: 0, students: 0, attempts: 0, completed: 0, average_score: null }, by_part: [], score_distribution: [], daily_activity: [], by_exam: [], recent_attempts: [] });
    }
    const filter = encodeURIComponent(inFilter(examIds));
    const [attempts, questions, ownedStudents, schools] = await Promise.all([
      dbRequest(ctx, '/rest/v1/exam_attempts?exam_id=in.' + filter + '&created_at=gte.' + encodeURIComponent(since) + '&select=id,exam_id,student_id,score,completed_at,created_at,result_detail,part_number&order=created_at.desc&limit=5000'),
      dbRequest(ctx, '/rest/v1/questions?owner_id=eq.' + encodeURIComponent(ctx.user.id) + '&exam_id=in.' + filter + '&select=id,exam_id,part,status&limit=10000'),
      dbRequest(ctx, '/rest/v1/profiles?created_by=eq.' + encodeURIComponent(ctx.user.id) + '&role=eq.student&select=id,display_name,username'),
      dbRequest(ctx, '/rest/v1/schools?created_by=eq.' + encodeURIComponent(ctx.user.id) + '&select=id')
    ]);
    const studentIds = new Set((ownedStudents || []).map(x => x.id));
    const schoolIds = (schools || []).map(x => x.id);
    if (schoolIds.length) {
      const memberships = await dbRequest(ctx, '/rest/v1/school_memberships?school_id=in.' + encodeURIComponent(inFilter(schoolIds)) + '&membership_role=eq.student&select=user_id&limit=5000');
      (memberships || []).forEach(x => studentIds.add(x.user_id));
    }
    (attempts || []).forEach(x => studentIds.add(x.student_id));
    const ids = [...studentIds];
    let profiles = ownedStudents || [];
    if (ids.length) {
      profiles = await dbRequest(ctx, '/rest/v1/profiles?id=in.' + encodeURIComponent(inFilter(ids)) + '&role=eq.student&select=id,display_name,username&limit=5000');
    }
    const names = new Map((profiles || []).map(x => [x.id, x.display_name || x.username || 'Estudiante']));
    const completed = (attempts || []).filter(x => x.completed_at);
    const scores = completed.map(x => Number(x.score)).filter(x => Number.isFinite(x) && x >= 0 && x <= 100);
    const parts = Array.from({ length: 7 }, (_, i) => ({ part: i + 1, total: 0, correct: 0 }));
    const daily = new Map();
    for (const attempt of completed) {
      const date = String(attempt.completed_at).slice(0, 10);
      daily.set(date, (daily.get(date) || 0) + 1);
      const detail = attempt.result_detail && Array.isArray(attempt.result_detail.by_part) ? attempt.result_detail.by_part : [];
      for (const row of detail) {
        const index = Number(row.part) - 1;
        if (index < 0 || index > 6 || !Number.isFinite(Number(row.total)) || Number(row.total) <= 0) continue;
        parts[index].total += Number(row.total);
        parts[index].correct += Number(row.correct || 0);
      }
      if (attempt.part_number && !detail.length) {
        const index = Number(attempt.part_number) - 1;
        if (index >= 0 && index < 7 && Number.isFinite(Number(attempt.score))) {
          parts[index].total += 1;
          parts[index].correct += Number(attempt.score) / 100;
        }
      }
    }
    const byPart = parts.map(x => ({ part: x.part, questions_answered: x.total, correct: Math.round(x.correct * 100) / 100, accuracy: x.total ? Math.round(x.correct / x.total * 1000) / 10 : null }));
    const buckets = [
      { range: '0–39%', min: 0, max: 40, count: 0 },
      { range: '40–59%', min: 40, max: 60, count: 0 },
      { range: '60–79%', min: 60, max: 80, count: 0 },
      { range: '80–100%', min: 80, max: 101, count: 0 }
    ];
    scores.forEach(score => { const bucket = buckets.find(x => score >= x.min && score < x.max); if (bucket) bucket.count++; });
    const examStats = (exams || []).map(exam => {
      const rows = (attempts || []).filter(a => a.exam_id === exam.id);
      const done = rows.filter(a => a.completed_at);
      return { id: exam.id, title: exam.title, status: exam.status, attempts: rows.length, completed: done.length, average_score: safeAverage(done.map(x => Number(x.score)).filter(Number.isFinite)) };
    });
    const now = Date.now(), cutoff = now - days * 86400000;
    const dailyActivity = [...daily.entries()].filter(([date]) => new Date(date + 'T00:00:00Z').getTime() >= cutoff).sort((a,b) => a[0].localeCompare(b[0])).map(([date,count]) => ({ date, completed: count }));
    const recent = (attempts || []).slice(0, 12).map(x => ({
      id: x.id, exam_id: x.exam_id, exam_title: exams.find(e => e.id === x.exam_id)?.title || 'Prueba',
      student_name: names.get(x.student_id) || 'Estudiante',
      completed_at: x.completed_at, created_at: x.created_at,
      score: x.score == null ? null : Number(x.score),
      part_number: x.part_number || null
    }));
    return jsonReply(res, 200, {
      range_days: days,
      summary: {
        exams: exams.length,
        published_exams: exams.filter(x => x.status === 'published').length,
        questions: (questions || []).length,
        students: studentIds.size,
        attempts: (attempts || []).length,
        completed: completed.length,
        average_score: safeAverage(scores)
      },
      by_part: byPart,
      score_distribution: buckets.map(({ range, count }) => ({ range, count })),
      daily_activity: dailyActivity,
      by_exam: examStats,
      recent_attempts: recent
    });
  } catch (error) {
    console.error('teacher-analytics:', error.message);
    return jsonReply(res, error.status || 500, { error: error.message || 'No se pudo construir el informe docente.' });
  }
}
