import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {installStorageContract} from './helpers/storage.mjs';
import {seedApprovedProducts} from './helpers/catalog-fixtures.mjs';
import {initialWizardDetails,wizardDetailsComplete} from '../src/lib/inventory/types.ts';
const db=new PGlite();const [a,b,c,viewer,editor,revoked,pending,admin]=Array.from({length:8},()=>randomUUID());let fa,fb,fc,fp,pid,pid2;
const product={manufacturer:'Wizard reference',catalog_number:'WIZ-1',name:'Existing approved supply',category:'General Surgery',product_kind:'disposable'};
const proposal={manufacturer:'New proposed maker',catalog_number:'NEW-1',name:'Proposed reference',category:'General Surgery',description:'Reference only',product_kind:'capital'};
const details={...initialWizardDetails,quantity:'2',quantity_unit:'box',units_per_package:'5',price_usd:'12.50',inventory_kind:'disposable'};
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const who=user=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[user??'']);
async function as(user,cb,role='authenticated'){await db.exec(`begin;set local role ${role}`);await who(user);try{return await cb();}finally{await db.exec('rollback');}}
const denied=(user,sql,args=[],role)=>assert.rejects(as(user,()=>db.query(sql,args),role),{code:'42501'});
const save=(id,revision=0,data={},step=2,productId=pid,facility=fa)=>scalar('select public.save_listing_wizard($1,$2,$3,$4,$5,$6)',[id,facility,productId,revision,data,step]);
const prepare=d=>scalar('select public.prepare_listing_wizard($1,$2)',[d.id,d.revision]);
const publish=d=>scalar('select public.publish_listing_wizard($1,$2)',[d.id,d.revision]);
async function reviewReady(){let d=await prepare(await save(randomUUID(),0,details));return save(d.id,d.revision,d.data,4);}
before(async()=>{
 await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 await installStorageContract(db);
 for(const f of(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(`../supabase/migrations/${f}`,import.meta.url),'utf8'));
 await seedApprovedProducts(db,[product,{...product,catalog_number:'WIZ-2'}]);pid=await scalar("select id from public.products where catalog_number='WIZ-1'");pid2=await scalar("select id from public.products where catalog_number='WIZ-2'");
 for(const user of[a,b,c,viewer,editor,revoked,pending,admin])await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[user,`${user}@example.test`]);
 const facilities=[];for(const user of[a,b,c,pending]){await who(user);facilities.push(await scalar("select public.onboard_facility('Wizard fixture','City','WI','hospital',gen_random_uuid())"));}
 [fa,fb,fc,fp]=facilities;await db.query("update public.facilities set status='approved' where id=any($1::uuid[])",[[fa,fb,fc]]);
 for(const [user,role,status]of[[viewer,'viewer','active'],[editor,'inventory_editor','active'],[revoked,'inventory_editor','revoked']])await db.query('insert into public.facility_memberships(facility_id,user_id,role,status) values($1,$2,$3,$4)',[fa,user,role,status]);
 await db.query("insert into private.platform_administrators(user_id,bootstrap_reason) values($1,'Local wizard review fixture')",[admin]);
});
after(()=>db.close());

test('incomplete details save privately with no fabricated quantity, price, stock or photos',async()=>{
 await as(a,async()=>{const d=await save(randomUUID(),0,{quantity:'',price_usd:''});assert.deepEqual(d.data,{quantity:'',price_usd:''});assert.equal(d.listing_id,null);assert.equal(await scalar('select count(*) from public.listings'),0);assert.equal(await scalar('select count(*) from public.listing_photos'),0);assert.equal((await db.query('select * from public.listing_wizard_drafts where id=$1',[d.id])).rows.length,1);});
 await denied(null,'select * from public.listing_wizard_drafts',[],'anon');
});

test('wizard data and mutations isolate three facilities; viewers and platform admins have no inventory override',async()=>{
 await who(a);const d=await save(randomUUID());
 for(const [user,facility]of[[b,fa],[c,fa],[viewer,fa],[revoked,fa],[pending,fp],[admin,fa]]){
  await denied(user,'select public.save_listing_wizard($1,$2,$3,0,$4,2)',[randomUUID(),facility,pid,{}]);
  await as(user,async()=>assert.equal((await db.query('select id from public.listing_wizard_drafts where id=$1',[d.id])).rows.length,0));
 }
 await as(editor,async()=>assert.ok(await save(d.id,d.revision,{notes:'Shared facility draft'})));
 await denied(a,'update public.listing_wizard_drafts set facility_id=$1 where id=$2',[fb,d.id]);
 await denied(b,'select public.save_listing_wizard($1,$2,$3,$4,$5,2)',[d.id,fb,pid,d.revision,{}]);
});

test('stale saves, forged privileged fields, invalid transitions and incomplete preparation fail without stock',async()=>{
 await assert.rejects(as(a,async()=>{const d=await save(randomUUID());await save(d.id,0,{});}),{code:'22023'});
 for(const data of [{facility_id:fb},{status:'active'},{notes:42},{owner_user_id:a}])await assert.rejects(as(a,()=>save(randomUUID(),0,data)),{code:'22023'});
 await assert.rejects(as(a,()=>save(randomUUID(),0,{},4)),{code:'22023'});
 const before=await scalar('select count(*) from public.listings');await assert.rejects(as(a,async()=>prepare(await save(randomUUID(),0,{}))));assert.equal(await scalar('select count(*) from public.listings'),before);
});

test('valid details create one private listing; back edits update it without transferring product or facility',async()=>{
 await as(a,async()=>{let d=await prepare(await save(randomUUID(),0,details));const lid=d.listing_id;assert.equal(d.step,3);assert.equal(await scalar('select status from public.listings where id=$1',[lid]),'draft');const photo=await scalar('select public.reserve_listing_photo($1)',[lid]);d=await save(d.id,d.revision,{...details,quantity:'3'},2);d=await prepare(d);assert.equal(d.listing_id,lid);assert.equal(await scalar('select quantity from public.listings where id=$1',[lid]),3);assert.equal(await scalar('select listing_id from public.listing_photos where id=$1',[photo.id]),lid);});
 await assert.rejects(as(a,async()=>{const d=await prepare(await save(randomUUID(),0,details));await save(d.id,d.revision,details,2,pid2);}),{code:'22023'});
 await denied(b,'select public.prepare_listing_wizard($1,1)',[(await scalar('select id from public.listing_wizard_drafts limit 1'))]);
});

test('review and latest details are required; pending photos and external stale edits block publishing',async()=>{
 await assert.rejects(as(a,async()=>publish(await prepare(await save(randomUUID(),0,details)))),{code:'22023'});
 await assert.rejects(as(a,async()=>{let d=await reviewReady();d=await save(d.id,d.revision,{...details,quantity:''},4);await publish(d);}),{code:'22023'});
 await assert.rejects(as(a,async()=>{const d=await reviewReady();await scalar('select public.reserve_listing_photo($1)',[d.listing_id]);await publish(d);}),{code:'22023'});
 await assert.rejects(as(a,async()=>{const d=await reviewReady();await db.query('select public.update_inventory_listing($1,$2,$3)',[d.listing_id,d.listing_revision,{notes:'Concurrent edit'}]);await publish(d);}),{code:'22023'});
});

test('publish is atomic and retry-safe; draft identity and publication permission stay live',async()=>{
 await as(a,async()=>{const d=await reviewReady();const id=await publish(d);assert.equal(await publish(d),id);assert.equal(await scalar('select status from public.listings where id=$1',[id]),'active');assert.equal(await scalar('select count(*) from public.listings where id=$1',[id]),1);});
 await who(a);const d=await reviewReady();await db.query("update public.facilities set status='suspended' where id=$1",[fa]);await denied(a,'select public.publish_listing_wizard($1,$2)',[d.id,d.revision]);await as(a,async()=>assert.equal((await db.query('select id from public.listing_wizard_drafts where id=$1',[d.id])).rows.length,0));await db.query("update public.facilities set status='approved' where id=$1",[fa]);
 await db.query("update public.facility_memberships set status='revoked' where user_id=$1 and facility_id=$2",[a,fa]);await denied(a,'select public.prepare_listing_wizard($1,$2)',[d.id,d.revision]);await db.query("update public.facility_memberships set status='active' where user_id=$1 and facility_id=$2",[a,fa]);
});

test('setup discard cannot delete another facility or a listing with photos',async()=>{
 await as(a,async()=>{const d=await save(randomUUID());await db.query('select public.discard_listing_setup($1,$2)',[d.id,d.revision]);assert.equal((await db.query('select id from public.listing_wizard_drafts where id=$1',[d.id])).rows.length,0);});
 await assert.rejects(as(a,async()=>{const d=await prepare(await save(randomUUID(),0,details));await db.query('select public.discard_listing_setup($1,$2)',[d.id,d.revision]);}),{code:'22023'});
});

test('product suggestions are pending reference-only records, idempotent and never self-approved',async()=>{
 await as(a,async()=>{const id=randomUUID();assert.equal(await scalar('select public.submit_product_reference($1,$2,$3)',[id,fa,{...proposal,status:'approved',requested_by:admin}]),id);assert.equal(await scalar('select public.submit_product_reference($1,$2,$3)',[id,fa,proposal]),id);assert.equal(await scalar('select status from public.product_submissions where id=$1',[id]),'pending');assert.equal(await scalar('select count(*) from public.products where normalized_catalog_number=$1',['new-1']),0);});
 await denied(a,"update public.product_submissions set status='approved'");
 await denied(a,'select public.review_product_reference($1,1,$2)',[randomUUID(),'approved']);
 await denied(null,'select * from public.product_submissions',[],'anon');
 for(const [user,facility]of[[viewer,fa],[revoked,fa],[pending,fp],[admin,fa]])await denied(user,'select public.submit_product_reference($1,$2,$3)',[randomUUID(),facility,proposal]);
});

test('admin approval normalizes manufacturer/catalog and never overwrites an existing shared reference',async()=>{
 const first=randomUUID(),second=randomUUID();await who(a);await db.query('select public.submit_product_reference($1,$2,$3)',[first,fa,proposal]);await who(b);await db.query('select public.submit_product_reference($1,$2,$3)',[second,fb,{...proposal,manufacturer:'  NEW   PROPOSED MAKER ',catalog_number:' new-1 ',name:'Overwrite attempt'}]);
 await as(b,async()=>assert.equal((await db.query('select id from public.product_submissions where id=$1',[first])).rows.length,0));
 await as(admin,async()=>{const id=await scalar('select public.review_product_reference($1,1,$2)',[first,'approved']);const reused=await scalar('select public.review_product_reference($1,1,$2)',[second,'approved']);assert.equal(id,reused);assert.equal(await scalar('select name from public.products where id=$1',[id]),proposal.name);});
 await assert.rejects(as(admin,()=>db.query('select public.review_product_reference($1,999,$2)',[first,'approved'])),{code:'22023'});
 await as(admin,async()=>{await db.query('select public.review_product_reference($1,1,$2,$3)',[first,'rejected','Please correct the catalog number.']);assert.equal(await scalar('select product_id from public.product_submissions where id=$1',[first]),null);assert.equal(await scalar('select count(*) from public.products where normalized_catalog_number=$1',['new-1']),0);});
});

test('direct legacy listing/draft APIs and private helpers cannot bypass product approval',async()=>{
 const inv={quantity:1,quantity_unit:'each',units_per_package:1,price_usd:'1',condition:'New / unopened',sterile:false,single_use:false};
 await denied(a,'select public.create_inventory_listing($1,$2,$3)',[fa,proposal,inv]);
 await denied(a,'select public.create_inventory_draft($1,$2,$3,$4)',[randomUUID(),fa,proposal,inv]);
 await denied(a,'select private.create_inventory_listing_internal($1,$2,$3)',[fa,proposal,inv]);
 await as(a,async()=>{const id=await scalar('select public.create_inventory_listing($1,$2,$3)',[fa,{...product,name:'Overwrite attempt'},inv]);assert.equal(await scalar('select name from public.products where id=(select product_id from public.listings where id=$1)',[id]),product.name);});
});

test('wizard Next validates quantity/package/USD fields while Save Draft can retain partial input',()=>{
 assert.equal(wizardDetailsComplete(initialWizardDetails),false);assert.equal(wizardDetailsComplete(details),true);
 for(const patch of [{quantity:''},{price_usd:''},{quantity_unit:'each',units_per_package:'5'},{price_usd:'1.005'},{inventory_kind:''},{notes:'x'.repeat(2001)},{expiration:'2026-02-30'}])assert.equal(wizardDetailsComplete({...details,...patch}),false);
});
