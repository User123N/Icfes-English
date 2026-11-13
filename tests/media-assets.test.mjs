import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/media-assets.js';

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
function setupEnv() {
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'public-test-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-test-key';
}
test('question media is uploaded to the teacher-owned exam folder', async t => {
  restore(t); setupEnv();
  const uid = '11111111-1111-4111-8111-111111111111';
  const examId = '22222222-2222-4222-8222-222222222222';
  let uploadedUrl = '';
  globalThis.fetch = async (url, options = {}) => {
    const target = String(url);
    if (target.includes('/auth/v1/user')) return new Response(JSON.stringify({ id: uid }), { status: 200 });
    if (target.includes('/rest/v1/profiles')) return new Response(JSON.stringify([{ id: uid, role: 'teacher_admin' }]), { status: 200 });
    if (target.includes('/rest/v1/exams?')) return new Response(JSON.stringify([{ id: examId, title: 'Exam', status: 'draft' }]), { status: 200 });
    if (target.includes('/storage/v1/object/question-media/')) { uploadedUrl = target; return new Response(JSON.stringify({ Key: 'stored' }), { status: 200 }); }
    if (target.includes('/rest/v1/media_assets')) return new Response(JSON.stringify([{ id: 'asset-1', storage_path: target }]), { status: 201 });
    if (target.includes('/rest/v1/audit_logs')) return new Response('[]', { status: 201 });
    throw new Error('Unexpected request: ' + target);
  };
  const dataUrl = 'data:image/png;base64,' + Buffer.from('test-image-data').toString('base64');
  const res = response();
  await handler({ method: 'POST', headers: { authorization: 'Bearer valid-token' }, body: { exam_id: examId, data_url: dataUrl, file_name: 'question.png' } }, res);
  assert.equal(res.statusCode, 201);
  assert.match(uploadedUrl, new RegExp(uid + '/' + examId + '/'));
  assert.match(res.body.image_path, /storage\/v1\/object\/public\/question-media/);
});
