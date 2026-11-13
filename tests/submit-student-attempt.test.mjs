import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/submit-student-attempt.js';

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
test('part practice is graded only against questions from that part', async t => {
  restore(t);
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-test-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key';
  let questionRequest = '';
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes('/auth/v1/user')) return new Response(JSON.stringify({ id: 'student-1' }), { status: 200 });
    if (target.includes('/rest/v1/profiles')) return new Response(JSON.stringify([{ role: 'student' }]), { status: 200 });
    if (target.includes('/rest/v1/exam_attempts?')) return new Response(JSON.stringify([{ id: 'attempt-1', exam_id: 'exam-1', completed_at: null, part_number: 2 }]), { status: 200 });
    if (target.includes('/rest/v1/questions?')) {
      questionRequest = target;
      return new Response(JSON.stringify([{ id: 'q2', part: 2, question: 'Choose the best word.', options: ['A', 'B', 'C', 'D'], correct_index: 1, explanation: 'B is correct.' }]), { status: 200 });
    }
    if (target.includes('/rest/v1/exam_attempts?id=')) return new Response(JSON.stringify([{ id: 'attempt-1' }]), { status: 200 });
    throw new Error('Unexpected fetch URL: ' + target);
  };
  const res = response();
  await handler({ method: 'POST', headers: { authorization: 'Bearer valid-token' }, body: { attempt_id: '11111111-1111-4111-8111-111111111111', answers: { q2: 1 } } }, res);
  assert.equal(res.statusCode, 200);
  assert.match(questionRequest, /part=eq\.2/);
  assert.equal(res.body.result_detail.part_number, 2);
  assert.equal(res.body.result_detail.total, 1);
  assert.equal(res.body.result_detail.score, 100);
});
