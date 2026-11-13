import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/teacher-versions.js';

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
test('version history is restricted to teacher administrators', async t => {
  restore(t); setup();
  globalThis.fetch = async url => {
    if (String(url).includes('/auth/v1/user')) return new Response(JSON.stringify({ id: 'teacher-1' }), { status: 200 });
    if (String(url).includes('/rest/v1/profiles')) return new Response(JSON.stringify([{ id: 'teacher-1', role: 'teacher' }]), { status: 200 });
    throw new Error('Unexpected request');
  };
  const res = response();
  await handler({ method: 'GET', headers: { authorization: 'Bearer valid-token' }, url: '/api/teacher-versions' }, res);
  assert.equal(res.statusCode, 403);
});
test('teacher administrator can save a shared content version', async t => {
  restore(t); setup();
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes('/auth/v1/user')) return new Response(JSON.stringify({ id: 'teacher-admin-1' }), { status: 200 });
    if (target.includes('/rest/v1/profiles')) return new Response(JSON.stringify([{ id: 'teacher-admin-1', role: 'teacher_admin' }]), { status: 200 });
    if (target.includes('/rest/v1/content_versions')) return new Response(JSON.stringify([{ id: 'version-1', version_number: 1, label: 'Backup', snapshot: JSON.parse(options.body).snapshot, created_at: new Date().toISOString() }]), { status: 201 });
    if (target.includes('/rest/v1/audit_logs')) return new Response('[]', { status: 201 });
    throw new Error('Unexpected request: ' + target);
  };
  const res = response();
  await handler({ method: 'POST', headers: { authorization: 'Bearer valid-token' }, body: { label: 'Backup', snapshot: { schema_version: 1, appState: { questions: [] } } }, url: '/api/teacher-versions' }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(res.body.version.version_number, 1);
});
