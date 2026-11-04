import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { captchaOptions } from '../src/lib/auth/captcha.mjs';

test('CAPTCHA requires a bounded token only when configured', () => {
  const f = new FormData();
  assert.deepEqual(captchaOptions(f, ''), {});
  for (const value of ['', '   ', 'x'.repeat(2049), new Blob(['file'])]) {
    f.set('captcha_token', value);
    assert.throws(() => captchaOptions(f, 'site-key'), { code: 'captcha_required' });
  }
  f.set('captcha_token', ' single-use-token ');
  assert.deepEqual(captchaOptions(f, 'site-key'), { captchaToken: 'single-use-token' });
});

const key = Symbol.for('h2h.captcha-test');
const dataModule = source => 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
const client = dataModule(`export async function createClient(){const s=globalThis[Symbol.for('h2h.captcha-test')];s.clients++;return {auth:Object.fromEntries(['signUp','signInWithPassword','resetPasswordForEmail','resend','signOut'].map(name=>[name,async(...args)=>{s.calls.push([name,...args]);return {error:s.error};}])),rpc:async()=>({data:s.enabled,error:null})};}`);
const auth = dataModule(`export function serviceError(e){return e.code==='captcha_required'?e.message:e.code==='captcha_failed'?'Verify again':'Unavailable';} export async function authenticatedClient(){throw Error('Unexpected authenticated operation');}`);
const navigation = dataModule(`export function redirect(path){throw Object.assign(Error('Redirect'),{path});}`);
let source = await readFile(new URL('../src/app/auth/actions.ts', import.meta.url), 'utf8');
for (const [from, to] of [
  ['@/lib/auth/registration.mjs', new URL('../src/lib/auth/registration.mjs', import.meta.url).href],
  ['@/lib/auth/captcha.mjs', new URL('../src/lib/auth/captcha.mjs', import.meta.url).href],
  ['@/lib/auth/photo-return.mjs', new URL('../src/lib/auth/photo-return.mjs', import.meta.url).href],
  ['@/lib/supabase/server', client], ['@/lib/auth/server', auth], ['next/navigation', navigation],
  ['next/cache', dataModule('export function revalidatePath(){}')],
  ['@/lib/app-mode', dataModule('export function getSiteUrl(){return "https://example.test";}')],
  ['@/lib/auth/policy', dataModule('export function validUuid(){return false;}')],
]) source = source.replace(JSON.stringify(from), JSON.stringify(to));
const actions = await import(dataModule(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText));
function form(token) {
  const f = new FormData();
  for (const [k,v] of Object.entries({email:'controlled@example.test',password:'fictional-password',display_name:'Fictional user',facility_npi:'1234567893',authorized_facility:'yes',accept_terms:'yes',next:'/listings/00000000-0000-4000-8000-000000000001/photos'})) f.set(k,v);
  if (token) f.set('captcha_token',token);
  return f;
}
test('actual Auth actions reject missing tokens before contacting Auth and forward tokens in each SDK options object', async () => {
  const original = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = 'site-key';
  try {
    for (const [action, sdk] of [['register','signUp'],['login','signInWithPassword'],['forgotPassword','resetPasswordForEmail'],['resendConfirmation','resend']]) {
      const s = globalThis[key] = {clients:0,calls:[],enabled:true};
      assert.match((await actions[action]({},form())).error,/Complete security verification/);
      assert.equal(s.clients,0);
      if (action==='login') await assert.rejects(actions[action]({},form('token')), e=>e.path==='/listings/00000000-0000-4000-8000-000000000001/photos');
      else assert.ok((await actions[action]({},form('token'))).success);
      assert.equal(s.calls[0][0],sdk);
      const options = action==='forgotPassword'?s.calls[0][2]:s.calls[0][1].options;
      assert.equal(options.captchaToken,'token');
      if(action==='register'){assert.equal(options.data.facility_npi,'1234567893');assert.equal(options.data.terms_accepted,true);assert.equal(options.data.authorized_facility,true);assert.equal(options.data.terms_version,'placeholder-2026-11-04');}
      s.error={code:'captcha_failed'};
      assert.equal((await actions[action]({},form('expired'))).error,'Verify again');
    }
    const incomplete=form('token');incomplete.delete('accept_terms');globalThis[key]={clients:0,calls:[],enabled:true};assert.ok((await actions.register({},incomplete)).error);assert.equal(globalThis[key].calls.length,0);
    const s=globalThis[key]={clients:0,calls:[],enabled:false};
    assert.match((await actions.login({},form('token'))).error,/disabled/);
    assert.equal(s.calls.at(-1)[0],'signOut');
    delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    globalThis[key]={clients:0,calls:[],enabled:true};
    assert.ok((await actions.register({},form())).success);
  } finally {
    if (original===undefined) delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
    else process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY=original;
    delete globalThis[key];
  }
});
