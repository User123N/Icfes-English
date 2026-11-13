import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const teacher = read('index.html');
const student = read('student.html');
const generator = read('api/generate-questions.js');
const quota = read('api/ai-usage.js');
const health = read('api/health.js');
const migration = read('backend/migrations/20261113_phase5_security_quotas_phase6_release_readiness.sql');
const workflow = read('.github/workflows/ci.yml');

assert.match(teacher, /id="stAIUsage"/, 'Teacher Studio must display remaining AI quota.');
assert.match(teacher, /\/api\/ai-usage/, 'Teacher Studio must load quota from the server.');
assert.match(teacher, /\/api\/question-drafts/, 'Teacher Studio must persist drafts through its API.');
assert.match(student, /bookmarksList/, 'Student library must include saved questions.');
assert.match(generator, /consume_ai_generation_quota/, 'AI generation must enforce database-backed quotas.');
assert.match(generator, /SUPABASE_SECRET_KEY/, 'AI generator must support the private Supabase secret-key alias.');
assert.match(quota, /authenticateTeacher/, 'Quota endpoint must authenticate the teacher.');
assert.match(health, /auth\/v1\/settings/, 'Health endpoint must verify Supabase connectivity.');
assert.match(migration, /create schema if not exists private/i, 'Authorization definer functions must be moved to a non-exposed schema.');
assert.match(migration, /ai_generation_usage/i, 'Daily quota counters must be persisted in Supabase.');
assert.match(migration, /revoke all on function public\.consume_ai_generation_quota/i, 'Quota RPC must be restricted to the service role.');
assert.match(workflow, /npm run verify/, 'CI must run the complete release verification command.');

for (const file of [
  'api/health.js',
  'api/ai-usage.js',
  'api/question-drafts.js',
  'api/teacher-analytics.js',
  'api/teacher-versions.js',
  'api/media-assets.js',
  'lib/supabase-server.js'
]) {
  assert.ok(fs.existsSync(new URL('../' + file, import.meta.url)), 'Missing release route: ' + file);
}

for (const html of [teacher, student]) {
  assert.doesNotMatch(html, /(?:SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SECRET_KEY|AI_PROVIDER_API_KEY)\s*[:=]\s*["'][^"']{8,}["']/,
    'A private server secret must never be embedded in a browser HTML file.');
}

process.stdout.write('Release readiness OK: teacher/student portals, secure AI quota, health route, private database functions, and server route inventory.\n');
