import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const migration=fs.readFileSync(new URL('../backend/migrations/20261027_multiexam_multirole.sql',import.meta.url),'utf8');
test('question editor supports two, three and four answer choices',()=>{
  assert.match(html,/id="qOptionCount"[\s\S]*value="2"[\s\S]*value="3"[\s\S]*value="4"/);
  assert.match(html,/slice\(0,optionCount\)/);
  assert.match(html,/function updateOptionFields\(\)/);
});
test('exam model has seven independent parts and cloud question persistence',()=>{
  assert.match(html,/function activeExamQuestions\(\)/);
  assert.match(html,/async function syncStateToCloud\(\)/);
  assert.match(html,/from\('exam_parts'\)\.upsert\(parts/);
  assert.match(migration,/create table if not exists public\.exams/);
  assert.match(migration,/unique\(exam_id, part_number\)/);
  assert.match(migration,/jsonb_array_length\(options\) between 2 and 4/);
});

test('scheduled releases include teacher UI, date windows and school/student targeting',()=>{
  const releases=fs.readFileSync(new URL('../backend/migrations/20261028_scheduled_exam_releases.sql',import.meta.url),'utf8');
  assert.match(html,/data-tab="releases"/);
  assert.match(html,/id="releaseForm"/);
  assert.match(html,/function bindReleaseManager\(\)/);
  assert.match(html,/function bindSchoolManager\(\)/);
  assert.match(html,/release_at/);
  assert.match(releases,/create table if not exists public\.exam_releases/);
  assert.match(releases,/target_type in \('all','school','student'\)/);
  assert.match(releases,/r\.release_at <= now\(\)/);
  assert.match(releases,/r\.expires_at is null or r\.expires_at > now\(\)/);
  assert.match(releases,/create table if not exists public\.school_memberships/);
  assert.match(releases,/create policy "owners manage exam releases"/);
});
