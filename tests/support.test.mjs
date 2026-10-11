import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {installStorageContract} from './helpers/storage.mjs';
import {uploadSupportScreenshot} from '../src/lib/support/pipeline.ts';
const db=new PGlite();const [a,b,admin,unconfirmed]=Array.from({length:4},()=>randomUUID());let ticket,photoTicket,facility;
const contact={name:'Example submitter',email:'preferred@example.test',phone:'555-0100',facility:'User-entered facility'};
const issue='A reproducible problem with my listing form.';
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
async function as(user,cb,role='authenticated'){await db.exec(`begin;set local role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user??'']);try{return await cb();}finally{await db.exec('rollback');}}
const denied=(user,sql,args=[],role)=>assert.rejects(as(user,()=>db.query(sql,args),role),{code:'42501'});
const submit=(id=randomUUID(),screenshot=false,c=contact)=>scalar('select public.submit_support_ticket($1,$2,$3,$4)',[id,c,issue,screenshot]);
before(async()=>{
 await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 await installStorageContract(db);
 for(const f of(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(`../supabase/migrations/${f}`,import.meta.url),'utf8'));
 for(const u of[a,b,admin,unconfirmed])await db.query('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,$3,$4)',[u,`${u}@example.test`,u===unconfirmed ? null : new Date().toISOString(),{role:'platform_administrator'}]);
 await db.query("insert into private.platform_administrators(user_id,bootstrap_reason) values($1,'Local support test bootstrap')",[admin]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
 facility=await scalar("select public.onboard_facility('Pending facility','City','WI','hospital',gen_random_uuid())");ticket=await submit();photoTicket=await submit(randomUUID(),true);
 await db.query("insert into public.facility_memberships(facility_id,user_id,role) values($1,$2,'administrator')",[facility,b]);
});
after(()=>db.close());
test('support is caller-private, confirmed and allowed for pending/suspended/revoked facility users',async()=>{
 await denied(null,'select * from public.support_tickets',[],'anon');await denied(null,'select public.submit_support_ticket($1,$2,$3,false)',[randomUUID(),contact,issue],'anon');
 await denied(unconfirmed,'select public.submit_support_ticket($1,$2,$3,false)',[randomUUID(),contact,issue]);
 await as(b,async()=>assert.equal(await scalar('select count(*)::int from public.support_tickets'),0));
 await as(a,async()=>{
  assert.equal(await scalar('select account_email from public.support_tickets where id=$1',[ticket.id]),`${a}@example.test`);
  assert.equal(await scalar('select contact_email from public.support_tickets where id=$1',[ticket.id]),contact.email);
  await db.exec('reset role');await db.query("update public.facilities set status='suspended' where id=$1",[facility]);await db.query("update public.facility_memberships set status='revoked' where facility_id=$1",[facility]);await db.exec('set local role authenticated');assert.ok((await submit()).id);
 });
 await as(admin,async()=>assert.equal(await scalar('select count(*)::int from public.support_tickets'),2));
});
test('ticket retries do not duplicate; privileged fields/ownership/status cannot be forged',async()=>{
 await as(a,async()=>{assert.equal((await submit(ticket.id)).id,ticket.id);assert.equal(await scalar('select count(*)::int from public.support_tickets'),2);});
 await denied(b,'select public.submit_support_ticket($1,$2,$3,false)',[ticket.id,contact,issue]);
 await denied(a,"update public.support_tickets set status='closed'");await denied(a,"insert into public.support_tickets(id,user_id,account_email,contact_email,contact_name,issue) values($1,$2,'x','x','xx','0123456789')",[randomUUID(),admin]);
 await denied(a,"select public.set_support_ticket_status($1,'closed')",[ticket.id]);
 await assert.rejects(as(a,()=>submit(randomUUID(),false,{...contact,user_id:admin})),{code:'22023'});
 await as(admin,async()=>{await db.query("select public.set_support_ticket_status($1,'in_progress')",[ticket.id]);assert.equal(await scalar('select status from public.support_tickets where id=$1',[ticket.id]),'in_progress');});
});
test('support ticket limits and issue/contact validation apply through direct RPC requests',async()=>{
 await assert.rejects(as(a,()=>submit(randomUUID(),false,{...contact,email:'bad'})),{code:'22023'});
 await assert.rejects(as(a,async()=>{for(let i=0;i<4;i++)await submit();}),{code:'22023'});
 await assert.rejects(as(a,()=>scalar('select public.submit_support_ticket($1,$2,$3,false)',[randomUUID(),contact,'short'])),{code:'22023'});
});
test('screenshot Storage exact-path ownership and certification are enforced against forged requests',async()=>{
 const path=photoTicket.screenshot_path;
 await denied(b,"insert into storage.objects(bucket_id,name,metadata) values('support-screenshots',$1,$2)",[path,{mimetype:'image/webp',size:100}]);
 await denied(a,"insert into storage.objects(bucket_id,name) values('support-screenshots',$1)",[`${photoTicket.id}/${randomUUID()}.webp`]);
 await denied(a,'select public.finalize_support_screenshot($1,$2,100,100,100)',[photoTicket.id,a]);
 await as(a,async()=>{
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('support-screenshots',$1,$2)",[path,{mimetype:'image/webp',size:100}]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[b]);assert.equal(await scalar('select count(*)::int from storage.objects where name=$1',[path]),0);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[admin]);assert.equal(await scalar('select count(*)::int from storage.objects where name=$1',[path]),0);
  await db.exec('set local role service_role');await db.query('select public.finalize_support_screenshot($1,$2,100,100,100)',[photoTicket.id,a]);
  await db.exec('reset role');await db.query("update public.support_tickets set created_at=clock_timestamp()-interval '2 days' where id=$1",[photoTicket.id]);await db.exec('set local role service_role');assert.equal(await scalar('select public.cleanup_stale_support_screenshot($1,false)',[photoTicket.id]),null);
  await db.exec('set local role authenticated');assert.equal(await scalar('select count(*)::int from storage.objects where name=$1',[path]),1);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[a]);assert.equal((await db.query('delete from storage.objects where name=$1 returning name',[path])).rows.length,0);
  assert.equal((await db.query("update storage.objects set name='forged.webp' where name=$1 returning name",[path])).rows.length,0);
  await db.query("select set_config('request.jwt.claim.sub','',true)");await db.exec('set local role anon');assert.equal(await scalar('select count(*)::int from storage.objects where name=$1',[path]),0);
 });
});
test('support Storage restrictive fences resist broad permissive policies',async()=>{
 await assert.rejects(as(a,async()=>{
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('support-screenshots',$1,$2)",[photoTicket.screenshot_path,{mimetype:'image/webp',size:100}]);
  await db.exec('reset role');await db.exec("create policy accidental_support_storage_broad on storage.objects for all to anon,authenticated using(true) with check(true)");await db.exec('set local role authenticated');
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[b]);assert.equal(await scalar('select count(*)::int from storage.objects where name=$1',[photoTicket.screenshot_path]),0);
  await db.query("insert into storage.objects(bucket_id,name) values('support-screenshots',$1)",[`${photoTicket.id}/forged.webp`]);
 }),{code:'42501'});
});
test('stale support cleanup never touches fresh/ready or unrelated files and requires byte deletion first',async()=>{
 await denied(a,'select public.support_cleanup_candidates()');
 await as(a,async()=>{
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('support-screenshots',$1,$2)",[photoTicket.screenshot_path,{mimetype:'image/webp',size:100}]);
  await db.exec('set local role service_role');assert.equal(await scalar('select public.cleanup_stale_support_screenshot($1,false)',[photoTicket.id]),null);
  await db.exec('reset role');await db.query("update public.support_tickets set created_at=clock_timestamp()-interval '2 days' where id=$1",[photoTicket.id]);await db.exec('set local role service_role');
  assert.equal(await scalar('select public.cleanup_stale_support_screenshot($1,false)',[photoTicket.id]),photoTicket.screenshot_path);
  await db.exec('savepoint not_deleted');await assert.rejects(db.query('select public.cleanup_stale_support_screenshot($1,true)',[photoTicket.id]),{code:'22023'});await db.exec('rollback to savepoint not_deleted');
  await db.query('delete from storage.objects where name=$1',[photoTicket.screenshot_path]);await db.query('select public.cleanup_stale_support_screenshot($1,true)',[photoTicket.id]);
  await db.exec('reset role');assert.equal(await scalar('select screenshot_state from public.support_tickets where id=$1',[photoTicket.id]),'none');
 });
});
test('support screenshot upload/finalization failures retain tickets and use only the exact reserved path',async()=>{
 const paths=[];const ticket={id:randomUUID(),screenshot_path:'reserved/exact.webp',screenshot_state:'pending'};
 const client={storage:{from:()=>({remove:async p=>{paths.push(p);return {error:null};},upload:async()=>({error:null})})}};
 const admin={rpc:async()=>({error:{message:'failure'}})};
 await assert.rejects(uploadSupportScreenshot(client,admin,ticket,a,{data:new Uint8Array([1]),width:1,height:1,size:1}),/Ticket saved/);
 assert.deepEqual(paths,[[ticket.screenshot_path],[ticket.screenshot_path]]);
 paths.length=0;await uploadSupportScreenshot(client,admin,{...ticket,screenshot_state:'ready'},a,{data:new Uint8Array([1]),width:1,height:1,size:1});assert.equal(paths.length,0);
});
