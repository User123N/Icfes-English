import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/teacher-analytics.js';

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;
function restore(t) {
  t.after(() => {
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
    globalThis.fetch = originalFetch;
  });
}
function response() {
  return {
    statusCode: 200, headers: {}, body: null,
    setHeader(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}
test('teacher analytics aggregates only owned exams and part results', async t => {
  restore(t);
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'public-test-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key';
  const teacherId = '11111111-1111-4111-8111-111111111111';
  const examId = '22222222-2222-4222-8222-222222222222';
  const studentId = '33333333-3333-4333-8333-333333333333';
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.includes('/auth/v1/user')) return new Response(JSON.stringify({ id: teacherId }), { status: 200 });
    if (target.includes('/rest/v1/profiles?id=eq.')) return new Response(JSON.stringify([{ id: teacherId, role: 'teacher_admin' }]), { status: 200 });
    if (target.includes('/rest/v1/exams?owner_id=')) return new Response(JSON.stringify([{ id: examId, title: 'Prueba de ejemplo', status: 'published', created_at: new Date().toISOString() }]), { status: 200 });
    if (target.includes('/rest/v1/exam_attempts?')) return new Response(JSON.stringify([{
      id: '44444444-4444-4444-8444-444444444444', exam_id: examId, student_id: studentId, score: 80, completed_at: new Date().toISOString(), created_at: new Date().toISOString(),
      result_detail: { by_part: [{ part: 1, total: 5, correct: 4 }, { part: 2, total: 5, correct: 3 }] }, part_number: null
    }]), { status: 200 });
    if (target.includes('/rest/v1/questions?')) return new Response(JSON.stringify([{ id: 'q1', exam_id: examId, part: 1, status: 'published' }]), { status: 200 });
    if (target.includes('/rest/v1/profiles?id=in.')) return new Response(JSON.stringify([{ id: studentId, display_name: 'Estudiante de prueba' }]), { status: 200 });
    if (target.includes('/rest/v1/schools?')) return new Response('[]', { status: 200 });
    throw new Error('Unexpected request: ' + target);
  };
  const res = response();
  await handler({ method: 'GET', url: '/api/teacher-analytics?days=30', headers: { authorization: 'Bearer valid-token' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.summary.published_exams, 1);
  assert.equal(res.body.summary.average_score, 80);
  assert.equal(res.body.summary.students, 1);
  assert.equal(res.body.by_part[0].accuracy, 80);
  assert.equal(res.body.by_part[1].accuracy, 60);
});
