import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const files = [
  'netlify/functions/public-config.mjs',
  'netlify/functions/generate-questions.mjs',
  'tests/public-config.test.mjs',
  'tests/generate-questions.test.mjs'
];
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) { process.stderr.write(result.stderr || result.stdout); process.exit(result.status || 1); }
}
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(m => m[1]).filter(code => code.trim());
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'icfes-inline-check-'));
try {
  scripts.forEach((code, i) => {
    const file = path.join(temp, `inline-${i}.js`);
    fs.writeFileSync(file, code);
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status !== 0) { process.stderr.write(`Syntax error in inline script ${i}:\n${result.stderr || result.stdout}`); process.exit(result.status || 1); }
  });
  process.stdout.write(`Syntax OK: ${files.length} module/test files and ${scripts.length} inline scripts.\n`);
} finally { fs.rmSync(temp, { recursive: true, force: true }); }
