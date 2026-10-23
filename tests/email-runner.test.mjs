import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {emailConfiguration,runEmailBatch} from '../scripts/email-runner.mjs';
import {deliverEmail} from '../scripts/email-delivery.mjs';

const env={H2H_EMAIL_ENABLED:'true',RESEND_API_KEY:'test-provider-key',SUPABASE_EMAIL_SECRET_KEY:'test-worker-key',H2H_EMAIL_FROM:'Hospital2Hospital <info@example.test>',NEXT_PUBLIC_SUPABASE_URL:'https://project.example.test',NEXT_PUBLIC_SITE_URL:'https://site.example.test'};
const job={id:'stable-job-id',claim_token:'private-token',kind:'referral',recipient:'recipient@example.test',payload:{referrer:'Test user',facility:'Test facility'}};

test('worker configuration fails closed for disabled, incomplete, insecure or malformed settings',()=>{
 assert.equal(emailConfiguration(env).delivery.siteUrl,'https://site.example.test');
 for(const changes of[{H2H_EMAIL_ENABLED:'false'},{RESEND_API_KEY:''},{SUPABASE_EMAIL_SECRET_KEY:''},{NEXT_PUBLIC_SITE_URL:'http://localhost:3000'},{NEXT_PUBLIC_SUPABASE_URL:'https://user:password@example.test'},{H2H_EMAIL_FROM:'info@example.test\nBcc: other@example.test'}])assert.throws(()=>emailConfiguration({...env,...changes}));
});

test('worker default invocation reports readiness without connecting, sending or printing secrets',()=>{
 const output=execFileSync(process.execPath,['scripts/email-worker.mjs'],{cwd:new URL('../',import.meta.url),env:{...process.env,...env},encoding:'utf8'});
 assert.equal(JSON.parse(output).configured,true);assert.ok(!output.includes('test-provider-key'));assert.ok(!output.includes('test-worker-key'));
});

test('batch claims at most 20, records exact token/provider receipts and handles an empty queue',async()=>{
 const calls=[];const client={rpc:async(name,args)=>{calls.push([name,args]);return name==='claim_email_jobs'?{data:[job]}:{error:null};}};
 const summary=await runEmailBatch(client,{}, {send:async()=> 'provider-id',pause:async()=>{}});
 assert.deepEqual(summary,{claimed:1,accepted:1,retry:0});assert.deepEqual(calls,[['claim_email_jobs',{p_limit:20}],['finish_email_job',{p_id:job.id,p_token:job.claim_token,p_provider_id:'provider-id'}]]);
 assert.deepEqual(await runEmailBatch({rpc:async()=>({data:[]})},{}),{claimed:0,accepted:0,retry:0});
});

test('provider rejection and uncertain outcomes retain the same delivery identity for bounded retry',async()=>{
 const keys=[],receipts=[];
 const client={rpc:async(name,args)=>name==='claim_email_jobs'?{data:[job]}:(receipts.push(args),{error:null})};
 const config=emailConfiguration(env).delivery;
 const transport=async(url,options)=>{keys.push(options.headers['Idempotency-Key']);return {ok:false};};
 for(let i=0;i<2;i++){const summary=await runEmailBatch(client,config,{send:(j,c)=>deliverEmail(j,c,transport),pause:async()=>{}});assert.equal(summary.retry,1);}
 assert.deepEqual(keys,['h2h-email/stable-job-id','h2h-email/stable-job-id']);assert.ok(receipts.every(r=>r.p_provider_id===null&&r.p_token===job.claim_token));
});

test('claim failure never sends; receipt failure stops before sending later claimed messages',async()=>{
 let sends=0;
 await assert.rejects(runEmailBatch({rpc:async()=>({error:{message:'private database error'}})}, {},{send:async()=>{sends++;}}),/Could not claim/);assert.equal(sends,0);
 const client={rpc:async(name)=>name==='claim_email_jobs'?{data:[job,{...job,id:'second'}]}:{error:{message:'private token'}}};
 await assert.rejects(runEmailBatch(client,{}, {send:async()=>{sends++;return 'provider-id';},pause:async()=>{}}),/receipt could not be recorded/);assert.equal(sends,1);
});

test('scheduler is main-only, opt-in, serialized and does not receive secrets during dependency installation',async()=>{
 const workflow=await readFile(new URL('../.github/workflows/email-delivery.yml',import.meta.url),'utf8');
 assert.ok(workflow.includes("github.ref == 'refs/heads/main' && vars.H2H_EMAIL_ENABLED == 'true'"));assert.ok(workflow.includes('workflow_dispatch:'));assert.ok(workflow.includes('cancel-in-progress: false'));assert.ok(workflow.includes('npm ci --ignore-scripts'));assert.ok(!workflow.includes('pull_request'));
 assert.ok(workflow.indexOf('RESEND_API_KEY:')>workflow.indexOf('name: Send one bounded batch'));
});
