import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/generate-questions.js';

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
function setupFetch({ role = 'teacher_admin', questions = null } = {}) {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'public-test-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key';
  process.env.AI_PROVIDER_API_KEY = 'ai-test-key';
  process.env.AI_MODEL = 'test-model';
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).includes('/auth/v1/user')) return new Response(JSON.stringify({ id: 'teacher-1' }), { status: 200 });
    if (String(url).includes('/rest/v1/profiles')) return new Response(JSON.stringify([{ id: 'teacher-1', role }]), { status: 200 });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ questions: questions || [{
      question: 'What is the main idea?', options: ['A', 'B', 'C', 'D'], correct: 0, explanation: 'It is stated in the text.'
    }] }) } }] }), { status: 200 });
  };
}
const req = (body, method = 'POST', headers = { authorization: 'Bearer valid-token' }) => ({ method, headers, body });

test('Vercel question generator rejects non-POST requests', t => {
  restore(t); const res = response();
  return handler(req({}, 'GET'), res).then(() => assert.equal(res.statusCode, 405));
});
test('Vercel question generator requires a teacher session', t => {
  restore(t); setupFetch(); const res = response();
  return handler(req({}, 'POST', {}), res).then(() => assert.equal(res.statusCode, 401));
});
test('Vercel question generator rejects student roles', t => {
  restore(t); setupFetch({ role: 'student' }); const res = response();
  return handler(req({ text: 'This is a long enough passage to satisfy the minimum length requirement for a question generation test.' }), res)
    .then(() => assert.equal(res.statusCode, 403));
});
test('Vercel question generator validates quantity before calling the AI provider', t => {
  restore(t); setupFetch(); const res = response();
  return handler(req({ text: 'This is a long enough passage to satisfy the minimum length requirement for a question generation test.', count: 21 }), res)
    .then(() => assert.equal(res.statusCode, 400));
});
test('Vercel question generator returns validated questions to teachers', t => {
  restore(t); setupFetch(); const res = response();
  return handler(req({ text: 'This is a long enough passage to satisfy the minimum length requirement for a question generation test.', count: 1, part: 2 }), res)
    .then(() => {
      assert.equal(res.statusCode, 200);
      assert.equal(res.body.questions.length, 1);
      assert.equal(res.body.questions[0].part, 2);
      assert.equal(res.body.questions[0].options.length, 4);
    });
});
test('Vercel question generator refuses malformed AI output', t => {
  restore(t); setupFetch({ questions: [{ question: 'Q', options: ['A'], correct: 0, explanation: 'E' }] }); const res = response();
  return handler(req({ text: 'This is a long enough passage to satisfy the minimum length requirement for a question generation test.', count: 1 }), res)
    .then(() => assert.equal(res.statusCode, 502));
});
