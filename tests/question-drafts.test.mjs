import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/question-drafts.js';

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
function setup() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'public-test-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key';
}
const teacher = { id: '11111111-1111-4111-8111-111111111111' };
const exam = '22222222-2222-4222-8222-222222222222';
const draft = '33333333-3333-4333-8333-333333333333';
const req = (method, body, url = '/api/question-drafts', headers = { authorization: 'Bearer valid-token' }) => ({ method, body, url, headers });

test('question drafts persist with teacher and exam ownership', async t => {
  restore(t); setup();
  let inserted;
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes('/auth/v1/user')) return new Response(JSON.stringify(teacher), { status: 200 });
    if (target.includes('/rest/v1/profiles')) return new Response(JSON.stringify([{ id: teacher.id, role: 'teacher_admin' }]), { status: 200 });
    if (target.includes('/rest/v1/exams?')) return new Response(JSON.stringify([{ id: exam, title: 'Prueba de prueba', status: 'draft' }]), { status: 200 });
    if (target.includes('/rest/v1/question_drafts?') && options.method === 'POST') {
      inserted = JSON.parse(options.body);
      return new Response(JSON.stringify(inserted.map((x, i) => ({ ...x, id: draft, batch_id: x.batch_id, created_at: new Date().toISOString() }))), { status: 201 });
    }
    if (target.includes('/rest/v1/audit_logs')) return new Response('[]', { status: 201 });
    throw new Error('Unexpected request: ' + target);
  };
  const res = response();
  await handler(req('POST', {
    action: 'save', exam_id: exam, source_material: 'A valid source passage with enough context.',
    questions: [{ part: 3, question: 'Choose the best response.', options: ['Thanks.', 'At seven.', 'Blue.', 'Yesterday.'], correct: 0, explanation: 'It is a natural response.' }]
  }), res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.drafts.length, 1);
  assert.equal(inserted[0].created_by, teacher.id);
  assert.equal(inserted[0].status, 'pending');
  assert.equal(inserted[0].exam_id, exam);
});

test('question drafts reject invalid questions before database insert', async t => {
  restore(t); setup();
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.includes('/auth/v1/user')) return new Response(JSON.stringify(teacher), { status: 200 });
    if (target.includes('/rest/v1/profiles')) return new Response(JSON.stringify([{ id: teacher.id, role: 'teacher_admin' }]), { status: 200 });
    if (target.includes('/rest/v1/exams?')) return new Response(JSON.stringify([{ id: exam, title: 'Prueba', status: 'draft' }]), { status: 200 });
    throw new Error('Unexpected write while validating: ' + target);
  };
  const res = response();
  await handler(req('POST', { action: 'save', exam_id: exam, questions: [{ part: 2, question: 'Incomplete', options: ['Only one'], correct: 0 }] }), res);
  assert.equal(res.statusCode, 400);
});

test('question drafts require an authenticated teacher', async t => {
  restore(t); setup();
  globalThis.fetch = async () => { throw new Error('Should not call Supabase without a bearer token'); };
  const res = response();
  await handler(req('GET', null, '/api/question-drafts?exam_id=' + exam, {}), res);
  assert.equal(res.statusCode, 401);
});
