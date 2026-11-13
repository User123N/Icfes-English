import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/ai-usage.js';

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
test('AI usage is scoped to the authenticated teacher and UTC day', async t => {
  restore(t);
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'public-test-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key';
  globalThis.fetch = async url => {
    const target = String(url);
    if (target.includes('/auth/v1/user')) return new Response(JSON.stringify({ id: 'teacher-1' }), { status: 200 });
    if (target.includes('/rest/v1/profiles')) return new Response(JSON.stringify([{ id: 'teacher-1', role: 'teacher' }]), { status: 200 });
    if (target.includes('/rest/v1/ai_generation_usage')) return new Response(JSON.stringify([{ request_count: 3, question_count: 14 }]), { status: 200 });
    throw new Error('Unexpected request: ' + target);
  };
  const res = response();
  await handler({ method: 'GET', url: '/api/ai-usage', headers: { authorization: 'Bearer valid-token' } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.requests.used, 3);
  assert.equal(res.body.requests.remaining, 17);
  assert.equal(res.body.questions.used, 14);
  assert.equal(res.body.questions.remaining, 86);
  assert.equal(res.body.timezone, 'UTC');
});

test('AI usage rejects unauthenticated requests', async t => {
  restore(t);
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'public-test-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key';
  const res = response();
  await handler({ method: 'GET', url: '/api/ai-usage', headers: {} }, res);
  assert.equal(res.statusCode, 401);
});
