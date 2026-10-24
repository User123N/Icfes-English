import test from 'node:test';
import assert from 'node:assert/strict';
import { handler } from '../netlify/functions/generate-questions.mjs';
const originalEnv = { ...process.env };
const validText = 'This is a sufficiently long English reading passage used to test the secure generation endpoint. It includes enough content to exceed the minimum length requirement for a request.';
function setup() {
  process.env.SUPABASE_URL = 'https://example.supabase.co'; process.env.SUPABASE_ANON_KEY = 'public-test-key'; process.env.AI_PROVIDER_API_KEY = 'test-secret'; process.env.AI_MODEL = 'test-model'; delete process.env.AI_API_URL;
  globalThis.fetch = async (url, options={}) => {
    if (String(url).includes('/auth/v1/user')) return new Response(JSON.stringify({id:'user-1'}), {status:200});
    if (String(url).includes('/rest/v1/profiles')) return new Response(JSON.stringify([{id:'user-1',role:'teacher_admin'}]), {status:200});
    return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({questions:[{question:'What is the main idea?',options:['A','B','C','D'],correct:0,explanation:'It is stated in the passage.'}]})}}]}), {status:200});
  };
}
const event = (body, method='POST', headers={'authorization':'Bearer valid-token'}) => ({httpMethod:method,body:JSON.stringify(body),headers});
test('rejects non-POST requests', async()=>{setup();const r=await handler(event({},'GET'));assert.equal(r.statusCode,405)});
test('rejects missing session', async()=>{setup();const r=await handler(event({},'POST',{}));assert.equal(r.statusCode,401)});
test('rejects unauthorized profile', async()=>{setup();const f=globalThis.fetch;globalThis.fetch=async(url,opts)=>String(url).includes('/auth/v1/user')?new Response(JSON.stringify({id:'user-1'}),{status:200}):new Response(JSON.stringify([]),{status:200});const r=await handler(event({text:validText}));assert.equal(r.statusCode,403);globalThis.fetch=f});
test('validates count before calling AI', async()=>{setup();const r=await handler(event({text:validText,count:21}));assert.equal(r.statusCode,400)});
test('returns validated generated question', async()=>{setup();const r=await handler(event({text:validText,count:1,part:2}));assert.equal(r.statusCode,200);const b=JSON.parse(r.body);assert.equal(b.questions.length,1);assert.equal(b.questions[0].options.length,4);assert.equal(b.questions[0].part,2)});
test('accepts NEXT_PUBLIC Supabase environment variable names', async()=>{setup();process.env.NEXT_PUBLIC_SUPABASE_URL=process.env.SUPABASE_URL;process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=process.env.SUPABASE_ANON_KEY;delete process.env.SUPABASE_URL;delete process.env.SUPABASE_ANON_KEY;const r=await handler(event({text:validText,count:1,part:2}));assert.equal(r.statusCode,200);delete process.env.NEXT_PUBLIC_SUPABASE_URL;delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY});
test('rejects malformed AI output', async()=>{setup();const f=globalThis.fetch;globalThis.fetch=async(url,opts={})=>{if(String(url).includes('/auth/v1/user'))return new Response(JSON.stringify({id:'user-1'}),{status:200});if(String(url).includes('/rest/v1/profiles'))return new Response(JSON.stringify([{id:'user-1',role:'teacher_admin'}]),{status:200});return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({questions:[{question:'Q',options:['A'],correct:0,explanation:'E'}]})}}]}),{status:200})};const r=await handler(event({text:validText,count:1}));assert.equal(r.statusCode,502);globalThis.fetch=f});
test('returns configuration error when AI key missing', async()=>{setup();delete process.env.AI_PROVIDER_API_KEY;const r=await handler(event({text:validText}));assert.equal(r.statusCode,503)});
