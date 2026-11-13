import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/health.js';

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
test('health endpoint reports configured services without exposing secrets', async t => {
  restore(t);
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'public-test-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'private-service-key';
  delete process.env.AI_PROVIDER_API_KEY;
  globalThis.fetch = async () => new Response(JSON.stringify({}), { status: 200 });
  const res = response();
  await handler({ method: 'GET' }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.core_ready, true);
  assert.equal(res.body.ai_ready, false);
  assert.equal(JSON.stringify(res.body).includes('private-service-key'), false);
  assert.equal(JSON.stringify(res.body).includes('public-test-key'), false);
});

test('health endpoint degrades safely when Supabase is unreachable', async t => {
  restore(t);
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'public-test-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'private-service-key';
  globalThis.fetch = async () => { throw new Error('offline'); };
  const res = response();
  await handler({ method: 'GET' }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.status, 'not_ready');
});
