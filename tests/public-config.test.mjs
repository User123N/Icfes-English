import test from 'node:test';
import assert from 'node:assert/strict';
import { handler } from '../netlify/functions/public-config.mjs';
const keys = ['NEXT_PUBLIC_SUPABASE_URL','SUPABASE_URL','NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_PUBLISHABLE_KEY','SUPABASE_ANON_KEY'];
const old = Object.fromEntries(keys.map(k => [k, process.env[k]]));
function clear() { for (const k of keys) delete process.env[k]; }
test('returns only public Supabase configuration', async () => {
  clear(); process.env.NEXT_PUBLIC_SUPABASE_URL='https://demo.supabase.co'; process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY='sb_publishable_test'; process.env.AI_PROVIDER_API_KEY='must-not-leak';
  const r=await handler({httpMethod:'GET'}); const body=JSON.parse(r.body); assert.equal(r.statusCode,200); assert.equal(body.supabaseUrl,'https://demo.supabase.co'); assert.equal(body.supabasePublishableKey,'sb_publishable_test'); assert.equal(JSON.stringify(body).includes('must-not-leak'),false);
});
test('accepts legacy variable names', async () => {
  clear(); process.env.SUPABASE_URL='https://legacy.supabase.co'; process.env.SUPABASE_ANON_KEY='public-test'; const r=await handler({httpMethod:'GET'}); assert.equal(r.statusCode,200); assert.equal(JSON.parse(r.body).supabasePublishableKey,'public-test');
});
test('rejects missing config and non-GET methods', async () => {
  clear(); assert.equal((await handler({httpMethod:'GET'})).statusCode,503); assert.equal((await handler({httpMethod:'POST'})).statusCode,405);
});
test.after(() => { for (const k of keys) { if (old[k] === undefined) delete process.env[k]; else process.env[k]=old[k]; } delete process.env.AI_PROVIDER_API_KEY; });
