import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {TARGET_EMAIL,PROJECT_ORIGIN,recoveryConfig,findRecoveryAccount,resetRecoveryPassword,validatePassword} from '../scripts/owner-password-recovery.mjs';
const user={id:'11111111-1111-4111-8111-111111111111',email:TARGET_EMAIL,email_confirmed_at:'2026-01-01T00:00:00Z'};
const password='Example-test-only-strong-password-42';

test('operator recovery is pinned to the exact existing project and requires a server credential',()=>{
 assert.equal(recoveryConfig({NEXT_PUBLIC_SUPABASE_URL:PROJECT_ORIGIN,SUPABASE_SECRET_KEY:'test-secret'}).configured,true);
 for(const url of ['https://other.supabase.co',PROJECT_ORIGIN+'/path',PROJECT_ORIGIN+'?key=x','http://rmgvchexfacjigukyvrx.supabase.co',PROJECT_ORIGIN.replace('https://','https://user:pass@')])assert.equal(recoveryConfig({NEXT_PUBLIC_SUPABASE_URL:url,SUPABASE_SECRET_KEY:'test-secret'}).configured,false);
 assert.equal(recoveryConfig({NEXT_PUBLIC_SUPABASE_URL:PROJECT_ORIGIN}).configured,false);
});

test('default CLI mode does not connect or print its credential; execute refuses piped input',()=>{
 const env={...process.env,NEXT_PUBLIC_SUPABASE_URL:PROJECT_ORIGIN,SUPABASE_SECRET_KEY:'test-secret-never-print'};
 const blockFetch='data:text/javascript,'+encodeURIComponent('globalThis.fetch=()=>{throw new Error("NETWORK MUST NOT RUN")};');
 const run=(args=[])=>spawnSync(process.execPath,['--import',blockFetch,'scripts/recover-owner-password.mjs',...args],{cwd:new URL('..',import.meta.url),env,encoding:'utf8'});
 const check=run();assert.equal(check.status,0);assert.match(check.stdout,/no service connection or password change/);assert.ok(!check.stdout.includes(env.SUPABASE_SECRET_KEY));
 const execute=run(['--execute']);assert.equal(execute.status,1);assert.match(execute.stderr,/interactively/);assert.ok(!execute.stderr.includes(env.SUPABASE_SECRET_KEY));
 assert.equal(run(['--password',password]).status,1);
});

test('lookup only accepts the exact email and traverses a full page before finding it',async()=>{
 let calls=0;
 const admin={listUsers:async({page,perPage})=>{calls++;assert.equal(perPage,200);return {data:{users:page===1?Array.from({length:200},(_,i)=>({id:String(i),email:`other-${i}@example.test`})):[user]}};}};
 assert.equal((await findRecoveryAccount(admin)).id,user.id);assert.equal(calls,2);
});

test('missing, duplicate, unconfirmed or suspended accounts fail closed without writes',async()=>{
 const cases=[[],[user,user],[{...user,email:'someone-else@example.test'}],[{...user,email_confirmed_at:null}],[{...user,banned_until:'2999-01-01T00:00:00Z'}]];
 for(const users of cases)await assert.rejects(findRecoveryAccount({listUsers:async()=>({data:{users}})}));
 const secretError='private-provider-detail';
 await assert.rejects(findRecoveryAccount({listUsers:async()=>{throw new Error(secretError);}}),error=>!error.message.includes(secretError));
});

test('recovery rechecks identity and updates only password, preserving every permission field',async()=>{
 const calls=[];const admin={getUserById:async(id)=>{calls.push(['read',id]);return {data:{user}};},updateUserById:async(id,attrs)=>{calls.push(['update',id,attrs]);return {data:{user}};}};
 await resetRecoveryPassword(admin,user.id,password);
 assert.deepEqual(calls,[['read',user.id],['update',user.id,{password}]]);
});

test('changed identities, lookup failures and invalid passwords never reach the write operation',async()=>{
 for(const current of [{...user,email:'other@example.test'},{...user,id:'other-id'},{...user,email_confirmed_at:null}]){
  let updated=false;await assert.rejects(resetRecoveryPassword({getUserById:async()=>({data:{user:current}}),updateUserById:async()=>{updated=true;}},user.id,password));assert.equal(updated,false);
 }
 for(const value of ['', 'short','x'.repeat(129),null])assert.throws(()=>validatePassword(value));
 let touched=false;await assert.rejects(resetRecoveryPassword({getUserById:async()=>{touched=true;}},user.id,'short'));assert.equal(touched,false);
});

test('uncertain updates and weak-password errors are sanitized and are never automatically retried',async()=>{
 for(const response of [new Error('sensitive detail '+password),{error:{code:'weak_password',message:password}},{error:{message:password}},{data:{user:{...user,email:'unexpected@example.test'}}}]){
  let updates=0;const admin={getUserById:async()=>({data:{user}}),updateUserById:async()=>{updates++;if(response instanceof Error)throw response;return response;}};
  await assert.rejects(resetRecoveryPassword(admin,user.id,password),error=>!error.message.includes(password));assert.equal(updates,1);
 }
});
