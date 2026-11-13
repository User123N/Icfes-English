import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const files = [
  'netlify/functions/public-config.mjs',
  'netlify/functions/generate-questions.mjs',
  'api/public-config.js',
  'api/create-students.js',
  'api/generate-questions.js',
  'api/submit-student-attempt.js',
  'api/student-tutor.js',
  'api/_lib/supabase-server.js',
  'api/question-drafts.js',
  'api/teacher-versions.js',
  'api/teacher-analytics.js',
  'api/media-assets.js',
  'tests/public-config.test.mjs',
  'tests/generate-questions.test.mjs',
  'tests/generate-questions-vercel.test.mjs',
  'tests/submit-student-attempt.test.mjs',
  'tests/question-drafts.test.mjs',
  'tests/teacher-analytics.test.mjs',
  'tests/media-assets.test.mjs',
  'tests/teacher-versions.test.mjs'
];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) { process.stderr.write(result.stderr || result.stdout); process.exit(result.status || 1); }
}
const htmlFiles = ['index.html', 'student.html'];
const scripts = htmlFiles.flatMap(htmlFile => {
  const html = fs.readFileSync(path.join(root, htmlFile), 'utf8');
  return [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => ({ htmlFile, code: m[1] })).filter(x => x.code.trim());
});
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'icfes-inline-check-'));
try {
  scripts.forEach(({ htmlFile, code }, i) => {
    const file = path.join(temp, `inline-${i}.js`);
    fs.writeFileSync(file, code);
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) { process.stderr.write(`Syntax error in ${htmlFile}, inline script ${i}:\n${result.stderr || result.stdout}`); process.exit(result.status || 1); }
  });
  process.stdout.write(`Syntax OK: ${files.length} module/test files and ${scripts.length} inline scripts across ${htmlFiles.length} HTML portals.\n`);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
