import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {installStorageContract} from './helpers/storage.mjs';
import {seedApprovedProducts} from './helpers/catalog-fixtures.mjs';
import {emailPayload} from '../scripts/email-delivery.mjs';
const db=new PGlite(),[owner,editor,buyer,admin,unconfirmed,viewer]=Array.from({length:6},randomUUID);
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const who=id=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);
async function as(id,fn,role='authenticated'){await db.exec(`begin;set local role ${role}`);await who(id);try{return await fn();}finally{await db.exec('rollback');}}
const deny=(id,sql,args=[],role)=>assert.rejects(as(id,()=>db.query(sql,args),role),{code:'42501'});
const registration={facility_npi:'1234567893',authorized_facility:true,terms_accepted:true,terms_version:'placeholder-2026-11-04'};
const enroll=name=>scalar("select public.onboard_facility_with_registration($1,'City','TX','hospital',gen_random_uuid(),'{}',$2)",[name,registration]);
const product={manufacturer:'Moderation fixture brand',catalog_number:'MOD-1',name:'Shared reference product',description:'Fixture description',category:'General Surgery',product_kind:'disposable'};
const inventory={quantity:2,quantity_unit:'each',units_per_package:1,price_usd:'10',sterile:false,single_use:true,condition:'New / unopened'};
let facility,buyerFacility,productId,manufacturerId,listing,legacy,knownLegacy,thread;
const stock=()=>scalar('select public.create_inventory_listing($1,$2,$3)',[facility,{id:productId},inventory]);
const editBody=()=>({manufacturer_id:manufacturerId,name:'Reviewed reference',catalog_number:'MOD-1',category:'ENT',description:'Updated shared description',product_kind:'capital',gtin:''});
const catalog=(action,revision=1,body={},request=randomUUID(),reason='Reviewed this catalog record')=>scalar('select public.admin_manage_catalog_product($1,$2,$3,$4,$5,$6,true)',[request,productId,revision,action,body,reason]);
const moderate=(id=listing,decision='reject',revision=1,request=randomUUID(),reason='The listing requires a clearer product description.')=>scalar('select public.admin_moderate_listing($1,$2,$3,$4,$5,true)',[request,id,revision,decision,reason]);
before(async()=>{
 await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}',banned_until timestamptz,deleted_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 await installStorageContract(db);
 const migrations=(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort();
 for(const f of migrations.filter(f=>!f.startsWith('20261105002300')))await db.exec(await readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
 for(const id of[owner,editor,buyer,admin,unconfirmed,viewer])await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)',[id,`${id}@example.test`,id===unconfirmed?null:new Date().toISOString()]);
 for(const id of[admin,unconfirmed])await db.query("insert into private.platform_administrators(user_id,bootstrap_reason) values($1,'Controlled test administrator')",[id]);
 await who(owner);facility=await enroll('Review fixture seller');await who(buyer);buyerFacility=await enroll('Review fixture buyer');
 await db.query("update public.facilities set status='approved' where id=any($1::uuid[])",[[facility,buyerFacility]]);
 await db.query("insert into public.facility_memberships(facility_id,user_id,role) values($1,$2,'inventory_editor'),($1,$3,'viewer')",[facility,editor,viewer]);
 await seedApprovedProducts(db,[product]);productId=await scalar('select id from public.products where catalog_number=$1',['MOD-1']);manufacturerId=await scalar('select manufacturer_id from public.products where id=$1',[productId]);
 await who(editor);knownLegacy=await stock();await db.query("insert into private.listing_draft_requests(request_id,user_id,facility_id,listing_id,payload) values(gen_random_uuid(),$1,$2,$3,'{}')",[editor,facility,knownLegacy]);
 await who(owner);legacy=await stock();
 await db.exec(await readFile(new URL('../supabase/migrations/20261105002300_catalog_review_listing_moderation.sql',import.meta.url),'utf8'));
 await who(editor);listing=await stock();await who(buyer);thread=await scalar("select public.contact_listing_seller($1,$2,'Fixture inquiry',gen_random_uuid())",[listing,buyerFacility]);
});
after(()=>db.close());
test('catalog/review RPCs deny anonymous, ordinary, viewer and unconfirmed admins; audit tables are private',async()=>{
 for(const user of[null,owner,editor,viewer,unconfirmed]){
  await deny(user,'select public.admin_catalog_directory()',[],user===null?'anon':undefined);
  await deny(user,'select public.admin_marketplace_directory()',[],user===null?'anon':undefined);
  await assert.rejects(as(user,()=>catalog('update',1,editBody()),user===null?'anon':'authenticated'),{code:'42501'});
  await assert.rejects(as(user,()=>moderate(),user===null?'anon':'authenticated'),{code:'42501'});
 }
 await deny(owner,'select * from private.catalog_admin_audit');await deny(admin,'select * from private.listing_moderation_audit');
 await deny(owner,"update public.products set name='Bypass' where id=$1",[productId]);
});
test('real author capture preserves known draft evidence and never guesses an older listing author',async()=>{
 assert.equal(await scalar('select created_by from public.listings where id=$1',[knownLegacy]),editor);
 assert.equal(await scalar('select created_by from public.listings where id=$1',[legacy]),null);
 assert.equal(await scalar('select created_by from public.listings where id=$1',[listing]),editor);
 await as(editor,async()=>{const id=await scalar('select public.create_inventory_listing($1,$2,$3)',[facility,{id:productId},{...inventory,created_by:admin,moderation_rejected:false}]);assert.equal(await scalar('select created_by from public.listings where id=$1',[id]),editor);});
});
test('catalog edits are audited, shared, revision-checked and idempotent; normalized duplicate identities are rejected',async()=>{
 await as(admin,async()=>{
  const request=randomUUID(),body=editBody(),result=await catalog('update',1,body,request);assert.equal(result.revision,2);assert.equal(result.name,body.name);
  assert.equal((await catalog('update',1,body,request)).revision,2);
  assert.equal((await scalar('select public.admin_catalog_directory($1)',[body.name])).total,1);
  await db.exec('reset role');assert.equal(await scalar('select count(*)::int from private.catalog_admin_audit where id=$1',[request]),1);assert.equal(await scalar('select name from public.marketplace_inventory where id=$1',[listing]),body.name);
 });
 await assert.rejects(as(admin,async()=>{await catalog('update',1,editBody());await catalog('update',1,editBody());}),{code:'22023'});
 await assert.rejects(as(admin,async()=>{const request=randomUUID();await catalog('update',1,editBody(),request);await catalog('update',1,{...editBody(),name:'Changed retry'},request);}),{code:'42501'});
 await assert.rejects(as(admin,async()=>{await db.exec('reset role');await db.query("insert into public.products(manufacturer_id,catalog_number,name,category) values($1,' MOD-2 ','Other reference','ENT')",[manufacturerId]);await db.exec('set local role authenticated');await catalog('update',1,{...editBody(),catalog_number:'mod-2'});}),{code:'22023'});
});
test('catalog deletion is reversible, preserves referenced stock/history and blocks new stock or draft selection',async()=>{
 await as(admin,async()=>{const archived=await catalog('archive');assert.ok(archived.archived_at);assert.equal((await scalar('select public.admin_catalog_directory(p_archived=>true)')).total,1);await db.exec('set local role anon');assert.equal(await scalar('select count(*)::int from public.marketplace_inventory where id=$1',[listing]),1);await db.exec('set local role authenticated');await who(admin);const restored=await catalog('restore',2);assert.equal(restored.archived_at,null);assert.equal(restored.revision,3);});
 await assert.rejects(as(admin,async()=>{await catalog('archive');await who(editor);await stock();}),{code:'22023'});
 await assert.rejects(as(admin,async()=>{await catalog('archive');await who(editor);await scalar('select public.save_listing_wizard($1,$2,$3,0,$4,2)',[randomUUID(),facility,productId,{}]);}),{code:'22023'});
 await assert.rejects(as(admin,async()=>{await who(editor);const draft=await scalar('select public.create_inventory_draft($1,$2,$3,$4)',[randomUUID(),facility,{id:productId},inventory]);await who(admin);await catalog('archive');await who(editor);await scalar("select public.update_inventory_listing($1,1,'{\"status\":\"active\"}')",[draft]);}),{code:'22023'});
});
test('admin directories search product and facility separately, exclude nonpublic stock and stay bounded',async()=>{
 await as(admin,async()=>{assert.equal((await scalar("select public.admin_marketplace_directory('MOD-1','seller')")).total,3);assert.equal((await scalar("select public.admin_marketplace_directory('MOD-1','buyer')")).total,0);assert.equal((await scalar('select public.admin_marketplace_directory()')).items.length,3);});
 await assert.rejects(as(admin,()=>scalar("select public.admin_catalog_directory(p_page=>0)")),{code:'22023'});
 await as(admin,async()=>{await who(editor);const id=await scalar('select public.create_inventory_draft($1,$2,$3,$4)',[randomUUID(),facility,{id:productId},inventory]);await who(admin);assert.ok(!(await scalar('select public.admin_marketplace_directory()')).items.some(l=>l.id===id));});
});
test('rejection hides stock/photos, retains conversations, adds facility-only alerts and blocks owner reactivation',async()=>{
 await as(admin,async()=>{
  await moderate();const rejected=(await scalar('select public.admin_marketplace_directory(p_rejected=>true)')).items[0];assert.equal(rejected.id,listing);assert.equal(rejected.revision,2);assert.equal(rejected.price_usd,null);assert.equal(rejected.quantity,null);
  await db.exec('set local role anon');await who(null);assert.equal(await scalar('select count(*)::int from public.marketplace_inventory where id=$1',[listing]),0);assert.equal(await scalar('select public.photo_can_read($1)',[listing]),false);
  await db.exec('set local role authenticated');await who(buyer);assert.equal(await scalar('select count(*)::int from public.facility_listing_alerts'),0);assert.equal((await scalar('select public.conversation_page($1)',[thread])).conversation.listing_status,'inactive');
  await who(editor);const alerts=(await db.query('select * from public.facility_listing_alerts')).rows;assert.equal(alerts.length,1);assert.match(alerts[0].reason,/clearer/);
 });
 await assert.rejects(as(admin,async()=>{await moderate();await who(owner);await scalar("select public.update_inventory_listing($1,2,'{\"status\":\"active\"}')",[listing]);}),{code:'42501'});
 await deny(owner,'update public.listings set moderation_rejected=false where id=$1',[listing]);
 await deny(editor,'update public.facility_listing_alerts set cleared_at=now() where listing_id=$1',[listing]);
});
test('rejection replay queues one mail to the real editor; unknown legacy authors use the verified owner; old workers skip the new kind',async()=>{
 await as(admin,async()=>{
  const request=randomUUID();await moderate(listing,'reject',1,request);await moderate(listing,'reject',1,request);
  await db.exec('set local role service_role');assert.equal((await scalar('select public.claim_email_jobs_v2()')).length,0);
  const jobs=await scalar('select public.claim_email_jobs_v3()');assert.equal(jobs.length,1);assert.equal(jobs[0].kind,'listing_rejected');assert.equal(jobs[0].recipient,`${editor}@example.test`);assert.match(jobs[0].payload.reason,/clearer/);assert.equal((await scalar('select public.claim_email_jobs_v3()')).length,0);
 });
 await as(admin,async()=>{await moderate(legacy);await db.exec('set local role service_role');assert.equal((await scalar('select public.claim_email_jobs_v3()'))[0].recipient,`${owner}@example.test`);});
 await deny(owner,'select public.claim_email_jobs_v3()');
});
test('release remains unpublished, clears the facility alert and cancels pending rejection emails',async()=>{
 await as(admin,async()=>{await moderate();await moderate(listing,'release',2);await db.exec('set local role service_role');assert.equal((await scalar('select public.claim_email_jobs_v3()')).length,0);await db.exec('set local role authenticated');await who(owner);assert.equal(await scalar('select status from public.listings where id=$1',[listing]),'inactive');assert.equal(await scalar('select count(*)::int from public.facility_listing_alerts where cleared_at is null'),0);await scalar("select public.update_inventory_listing($1,3,'{\"status\":\"active\"}')",[listing]);assert.equal(await scalar('select status from public.listings where id=$1',[listing]),'active');});
});
test('email claims cancel after recipient email/access changes; dashboard notice remains without an eligible recipient',async()=>{
 for(const change of['email','disabled','membership'])await as(admin,async()=>{await moderate();await db.exec('reset role');if(change==='email')await db.query('update auth.users set email=$1 where id=$2',['changed@example.test',editor]);if(change==='disabled')await db.query('insert into private.account_controls(user_id,disabled) values($1,true)',[editor]);if(change==='membership')await db.query("update public.facility_memberships set status='revoked' where facility_id=$1 and user_id=$2",[facility,editor]);await db.exec('set local role service_role');assert.equal((await scalar('select public.claim_email_jobs_v3()')).length,0);});
 await as(admin,async()=>{await db.exec('reset role');await db.query('update auth.users set email_confirmed_at=null where id=any($1::uuid[])',[[owner,editor]]);await db.exec('set local role authenticated');await moderate();await db.exec('reset role');assert.equal(await scalar('select count(*)::int from public.facility_listing_alerts'),1);assert.equal(await scalar("select count(*)::int from private.email_jobs where kind='listing_rejected'"),0);});
 const payload=emailPayload({kind:'listing_rejected',recipient:'controlled@example.test',listing_id:listing,payload:{product:'Fixture reference',catalog:'MOD-1',facility:'Fictional seller',reason:'The listing requires clarification.'}},{from:'H2H <info@example.test>',siteUrl:'https://example.test'});assert.match(payload.text,/Reason: The listing requires clarification/);assert.match(payload.text,/https:\/\/example.test\/dashboard/);assert.ok(!payload.text.toLowerCase().includes('idiot'));
});
test('missing consent, short reasons, stale listing revisions and changed replay identities fail without another action',async()=>{
 await assert.rejects(as(admin,()=>scalar('select public.admin_moderate_listing($1,$2,1,$3,$4,false)',[randomUUID(),listing,'reject','Reviewed fixture listing'])),{code:'22023'});
 await assert.rejects(as(admin,()=>moderate(listing,'reject',99)),{code:'22023'});
 await assert.rejects(as(admin,()=>moderate(listing,'reject',1,randomUUID(),'short')),{code:'22023'});
 await assert.rejects(as(admin,async()=>{const request=randomUUID();await moderate(listing,'reject',1,request);await moderate(legacy,'reject',1,request);}),{code:'42501'});
 await as(admin,async()=>{await db.exec('reset role');await db.query('insert into private.account_controls(user_id,disabled) values($1,true)',[admin]);await db.exec('set local role authenticated');await assert.rejects(scalar('select public.admin_marketplace_directory()'),{code:'42501'});});
});
