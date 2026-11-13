import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';

const key=Symbol.for('h2h.welcome-routing-test');
const data=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const state=()=>globalThis[key]={mode:'connected',user:null};
let source=await readFile(new URL('../src/app/page.tsx',import.meta.url),'utf8');
for(const [from,to] of [
 ['next/navigation',data(`export function redirect(path){throw new Error('redirect:'+path);}`)],
 ['@/lib/app-mode',data(`export function getAppMode(){return globalThis[Symbol.for('h2h.welcome-routing-test')].mode;}`)],
 ['@/lib/auth/server',data(`export async function authenticatedClient(){return {user:globalThis[Symbol.for('h2h.welcome-routing-test')].user};}`)],
 ...[['account-pages','WelcomeLogin'],['welcome-marketplace','WelcomeMarketplace'],['welcome-landing','WelcomeLanding']].map(([path,name])=>['@/components/'+path,data(`export const ${name}='${name}';`)]),
]) source=source.replace(JSON.stringify(from),JSON.stringify(to));
source=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
source=source.replace('"react/jsx-runtime"',JSON.stringify(import.meta.resolve('react/jsx-runtime')));
const {default:Page}=await import(data(source));
const page=params=>Page({searchParams:Promise.resolve(params)});

test('anonymous entry shows information and carousel; explicit auth links keep their requested standalone card',async()=>{
 state();
 for(const params of [{},{welcome:'unknown'},{welcome:['login','register']}]) {
  const result=await page(params);
  assert.deepEqual(result.props.children.map(child=>child.type),['WelcomeLanding','WelcomeMarketplace']);
 }
 for(const kind of ['login','register','forgot','resend']) {
  const result=await page({welcome:kind});
  assert.equal(result.type,'WelcomeLogin');assert.equal(result.props.kind,kind);
 }
});

test('authenticated entry keeps marketplace redirect and email confirmation gate; demo stays separate',async()=>{
 const context=state();context.user={email_confirmed_at:'2026-11-13'};
 await assert.rejects(page({welcome:'login',q:'surgical supplies'}),/redirect:\/marketplace\?q=surgical\+supplies/);
 context.user={email_confirmed_at:null};await assert.rejects(page({}),/redirect:\/auth\/login\?notice=confirmation/);
 context.mode='demo';context.user=null;await assert.rejects(page({}),/redirect:\/marketplace$/);
});
