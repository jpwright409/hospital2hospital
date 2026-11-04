import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {installStorageContract} from './helpers/storage.mjs';
import {seedApprovedProducts} from './helpers/catalog-fixtures.mjs';
import {parseStates,states,expirationMatches} from '../src/lib/inventory/filters.mjs';
import {parseInventoryQuery,inventoryUrl} from '../src/lib/inventory/types.ts';
import {registrationDeclaration,registrationTermsVersion} from '../src/lib/auth/registration.mjs';
import {emailPayload} from '../scripts/email-delivery.mjs';
const db=new PGlite(),[owner,buyer,admin,unconfirmed]=Array.from({length:4},randomUUID);
const registration={facility_npi:'1234567893',authorized_facility:true,terms_accepted:true,terms_version:registrationTermsVersion};
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const who=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);
async function as(id,fn,role='authenticated'){await db.exec(`begin;set local role ${role}`);await who(id);try{return await fn();}finally{await db.exec('rollback');}}
const enroll=(request=randomUUID(),reg=registration,state='TX')=>scalar("select public.onboard_facility_with_registration('Fictional facility','City',$1,'hospital',$2,'{}',$3)",[state,request,reg]);
let tx,ca,hidden;
const product={manufacturer:'Owner asks test brand',catalog_number:'ASKS-1',name:'Test product',category:'General Surgery',description:'Fixture only',product_kind:'disposable'};
before(async()=>{
 await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}',banned_until timestamptz,deleted_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 await installStorageContract(db);
 for(const f of(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
 for(const id of[owner,buyer,admin,unconfirmed])await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)',[id,`${id}@example.test`,id===unconfirmed?null:new Date().toISOString()]);
 await db.query("insert into private.platform_administrators(user_id,bootstrap_reason) values($1,'Fictional test administrator')",[admin]);
 await seedApprovedProducts(db,[product]);await who(owner);tx=await enroll();ca=await enroll(randomUUID(),registration,'CA');hidden=await enroll(randomUUID(),registration,'WI');
 await db.query("update public.facilities set status='approved' where id=any($1::uuid[])",[[tx,ca]]);
 const dates=[await scalar('select (current_date-1)::text'),await scalar('select current_date::text'),await scalar("select (current_date+interval '12 months')::date::text"),await scalar("select ((current_date+interval '12 months')::date+1)::text"),''];
 for(const [i,expiration] of dates.entries())await scalar('select public.create_inventory_listing($1,$2,$3)',[i===0?ca:tx,product,{quantity:1,quantity_unit:'each',units_per_package:1,price_usd:'10',sterile:false,single_use:true,condition:'New / unopened',expiration,inventory_kind:'disposable'}]);
});
after(()=>db.close());
test('all 50 states parse, deduplicate and survive pagination with expiration filters',()=>{
 assert.equal(states.length,50);assert.deepEqual(parseStates(['tx','CA','TX','Dallas','XX']),['CA','TX']);
 const q=parseInventoryQuery({states:['TX','CA'],expiration_status:'short_date',q:'device'});
 const url=new URL(inventoryUrl('/marketplace',q,2),'https://example.test');assert.deepEqual(url.searchParams.getAll('states'),['CA','TX']);assert.equal(url.searchParams.get('expiration_status'),'short_date');assert.equal(url.searchParams.get('page'),'2');
 assert.deepEqual(parseInventoryQuery({location:'Dallas'}).states,[]);
 assert.equal(expirationMatches('2027-11-04','short_date','2026-11-04'),true);
 assert.equal(expirationMatches('2027-11-05','in_date','2026-11-04'),true);
 assert.equal(expirationMatches(null,'expired','2026-11-04'),false);
 assert.equal(expirationMatches('2025-02-28','short_date','2024-02-29'),true);
});
test('real search v3 filters states with OR, dates at boundaries, and retains public visibility and private-stock gates',async()=>{
 await as(null,async()=>{
  for(const [status,count]of[['',5],['expired',1],['short_date',2],['in_date',1]])assert.equal((await scalar('select public.search_inventory_v3(p_expiration_status=>$1)',[status])).total,count);
  assert.equal((await scalar("select public.search_inventory_v3(p_states=>array['CA','TX'])")).total,5);
  assert.equal((await scalar("select public.search_inventory_v3(p_states=>array['CA'])")).total,1);
  assert.equal((await scalar("select public.search_inventory_v3(p_states=>array['WI'])")).total,0);
 },'anon');
 await assert.rejects(as(null,()=>scalar("select public.search_inventory_v3(p_states=>array['Dallas'])"),'anon'),{code:'22023'});
 await assert.rejects(as(buyer,()=>scalar('select public.search_inventory_v3(p_facility_id=>$1)',[tx])),{code:'42501'});
 await assert.rejects(as(null,()=>scalar('select public.search_inventory_v3(p_saved=>true)'),'anon'),{code:'42501'});
});
test('NPI/certification/terms are required server-side and at the guarded facility API; legacy bypasses are closed',async()=>{
 const f=new FormData();assert.throws(()=>registrationDeclaration(f));f.set('facility_npi','1234567893');f.set('authorized_facility','yes');assert.throws(()=>registrationDeclaration(f));f.set('accept_terms','yes');assert.deepEqual(registrationDeclaration(f),registration);
 for(const change of[{facility_npi:'bad'},{authorized_facility:false},{terms_accepted:false},{terms_accepted:'true'},{terms_version:'forged'}])await assert.rejects(as(owner,()=>enroll(randomUUID(),{...registration,...change})),{code:'22023'});
 await assert.rejects(as(owner,()=>scalar("select public.onboard_facility('Bypass','City','TX','hospital',gen_random_uuid())")),{code:'42501'});
 await assert.rejects(as(owner,()=>scalar("select public.onboard_facility_with_contacts('Bypass','City','TX','hospital',gen_random_uuid(),'{}')")),{code:'42501'});
 await assert.rejects(as(unconfirmed,()=>enroll()),{code:'42501'});
 await as(owner,async()=>{const request=randomUUID(),id=await enroll(request);assert.equal(await enroll(request),id);const f=(await db.query('select * from public.facilities where id=$1',[id])).rows[0];assert.equal(f.facility_npi,registration.facility_npi);assert.equal(f.registration_certified_by,owner);assert.equal(f.status,'pending');assert.ok(f.registration_accepted_at);});
});
test('signup declarations are caller-private immutable snapshots; user metadata changes never grant approval',async()=>{
 const id=randomUUID();await db.query('insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values($1,$2,now(),$3)',[id,'fictional-new@example.test',registration]);
 assert.equal(await scalar('select facility_npi from private.registration_declarations where user_id=$1',[id]),registration.facility_npi);
 await db.query("update auth.users set raw_user_meta_data='{}' where id=$1",[id]);
 await as(id,async()=>{assert.equal((await scalar('select public.my_registration_declaration()')).facility_npi,registration.facility_npi);assert.equal(await scalar('select public.is_platform_administrator()'),false);});
 await as(buyer,async()=>assert.equal(await scalar('select public.my_registration_declaration()'),null));
 await assert.rejects(as(id,()=>scalar('select * from private.registration_declarations')),{code:'42501'});
});
test('facility approval queues one owner email per transition, cancels obsolete approvals, and uses service-only live eligibility',async()=>{
 await as(admin,async()=>{
  await db.query("select public.review_facility($1,'approved')",[hidden]);await db.query("select public.review_facility($1,'approved')",[hidden]);
  await db.exec('reset role');assert.equal(await scalar("select count(*)::int from private.email_jobs where facility_id=$1 and state='pending'",[hidden]),1);
  await db.exec('set local role service_role');assert.equal((await scalar('select public.claim_email_jobs()')).length,0);const jobs=await scalar('select public.claim_email_jobs_v2()');assert.equal(jobs.length,1);assert.equal(jobs[0].kind,'facility_approved');assert.equal(jobs[0].recipient,`${owner}@example.test`);
 });
 await as(admin,async()=>{
  await db.query("select public.review_facility($1,'approved')",[hidden]);await db.query("select public.review_facility($1,'suspended','Reviewed test suspension')",[hidden]);
  await db.exec('set local role service_role');assert.equal((await scalar('select public.claim_email_jobs_v2()')).length,0);
 });
 await as(admin,async()=>{await db.query("select public.review_facility($1,'approved')",[hidden]);await db.exec('reset role');await db.query('insert into private.account_controls(user_id,disabled) values($1,true)',[owner]);await db.exec('set local role service_role');assert.equal((await scalar('select public.claim_email_jobs_v2()')).length,0);});
 await assert.rejects(as(owner,()=>scalar('select public.claim_email_jobs_v2()')),{code:'42501'});
 const payload=emailPayload({kind:'facility_approved',recipient:'controlled@example.test',payload:{facility:'Fictional facility'}},{from:'H2H <info@example.test>',siteUrl:'https://example.test'});assert.match(payload.text,/Your facility, Fictional facility, has been verified/);assert.match(payload.text,/https:\/\/example.test\/marketplace/);
});
test('owner manufacturer references exist without fabricated products and retain corrected Unicode names',async()=>{
 assert.equal(await scalar("select count(*)::int from public.manufacturers where name=U&'M\\00F6lnlycke Health Care'"),1);
 assert.equal(await scalar("select count(*)::int from public.manufacturers where name='GI Supply, Inc'"),1);
 assert.equal(await scalar("select count(*)::int from public.manufacturers where name='Acclarent'"),1);
 assert.equal(await scalar("select count(*)::int from public.products p join public.manufacturers m on m.id=p.manufacturer_id where m.name='Acclarent'"),0);
});
