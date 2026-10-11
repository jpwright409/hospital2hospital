import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {installStorageContract} from './helpers/storage.mjs';
const db=new PGlite();const [a,b,c,pending,admin,viewer,editor,revoked]=Array.from({length:8},()=>randomUUID());let fa,fb,fc,fp,la,la2,lb,lc,lp;
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const who=user=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[user??'']);
async function as(user,cb,role='authenticated'){await db.exec(`begin;set local role ${role}`);await who(user);try{return await cb();}finally{await db.exec('rollback');}}
const deny=(user,sql,args=[],role)=>assert.rejects(as(user,()=>db.query(sql,args),role),{code:'42501'});
const request=id=>scalar('select public.request_listing_boost($1)',[id]);
const review=(id,revision=1,decision='approved',slot=1)=>db.query('select public.review_listing_boost($1,$2,$3,$4)',[id,revision,decision,slot]);
async function operator(sql,args=[]){await db.exec('reset role');await db.query(sql,args);await db.exec('set local role authenticated');}
before(async()=>{
 await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 await installStorageContract(db);
 for(const f of(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(`../supabase/migrations/${f}`,import.meta.url),'utf8'));
 for(const user of[a,b,c,pending,admin,viewer,editor,revoked])await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[user,`${user}@example.test`]);
 const facilities=[];for(const user of[a,b,c,pending]){await who(user);facilities.push(await scalar("select public.onboard_facility('Boost fixture','City','WI','hospital',gen_random_uuid())"));}
 [fa,fb,fc,fp]=facilities;await db.query("update public.facilities set status='approved' where id=any($1::uuid[])",[[fa,fb,fc,fp]]);
 const listings=[];for(const [user,f] of[[a,fa],[a,fa],[b,fb],[c,fc],[pending,fp]]){
  await who(user);listings.push(await scalar('select public.create_inventory_listing($1,$2,$3)',[f,{manufacturer:'Reference fixture',catalog_number:'BOOST-1',name:'Reference supply',description:'Fixture',category:'General Surgery'},{quantity:1,quantity_unit:'each',units_per_package:1,price_usd:'10',condition:'New / unopened',sterile:false,single_use:false}]));
 }
 [la,la2,lb,lc,lp]=listings;
 await db.query("update public.facilities set status='suspended' where id=$1",[fc]);await db.query("update public.facilities set status='pending' where id=$1",[fp]);
 for(const [user,role,status]of[[viewer,'viewer','active'],[editor,'inventory_editor','active'],[revoked,'owner','revoked']])await db.query('insert into public.facility_memberships(facility_id,user_id,role,status) values($1,$2,$3,$4)',[fa,user,role,status]);
 await db.query("insert into private.platform_administrators(user_id,bootstrap_reason) values($1,'Local boost authorization fixture')",[admin]);
});
after(()=>db.close());
test('anonymous sees only publicly featured IDs, never review records or seller/admin operations',async()=>{
 await as(null,async()=>assert.deepEqual(await scalar('select public.public_featured_listing_ids()'),[]),'anon');
 for(const sql of['select * from public.listing_boost_requests','select * from public.featured_listing_slots','select public.my_boost_options()','select public.boost_review_queue()'])await deny(null,sql,[],'anon');
 await deny(null,'select public.request_listing_boost($1)',[la],'anon');
});
test('boost facilities/options follow live approval and eligible membership; unrelated and viewer facilities are absent',async()=>{
 for(const [user,facility]of[[a,fa],[b,fb],[editor,fa]])await as(user,async()=>{const opts=await scalar('select public.my_boost_options()');assert.deepEqual(opts.map(f=>f.id),[facility]);assert.ok(opts[0].listings.length>0);});
 for(const user of[c,pending,viewer,revoked,admin])await as(user,async()=>assert.deepEqual(await scalar('select public.my_boost_options()'),[]));
 for(const [user,listing]of[[b,la],[c,lc],[pending,lp],[viewer,la],[revoked,la],[admin,la]])await deny(user,'select public.request_listing_boost($1)',[listing]);
 await as(a,async()=>{await operator("update public.facility_memberships set status='revoked' where user_id=$1",[a]);assert.deepEqual(await scalar('select public.my_boost_options()'),[]);await assert.rejects(request(la),{code:'42501'});});
});
test('multi-facility inventory editors can request from either approved facility without changing account selection',async()=>{
 await as(editor,async()=>{
  await operator("insert into public.facility_memberships(facility_id,user_id,role) values($1,$2,'inventory_editor')",[fb,editor]);
  const options=await scalar('select public.my_boost_options()');assert.deepEqual(options.map(f=>f.id).sort(),[fa,fb].sort());
  const selected=await scalar('select active_facility_id from public.profiles');await request(la);await request(lb);assert.equal(await scalar('select count(*)::int from public.listing_boost_requests'),2);assert.equal(await scalar('select active_facility_id from public.profiles'),selected);
 });
});
test('anonymous featured inventory exposes only the approved public projection, not account or membership fields',async()=>{
 await as(a,async()=>{const id=await request(la);await who(admin);await review(id);await db.exec('set local role anon');await who(null);
  const items=await scalar('select public.public_featured_inventory()');assert.equal(items.length,1);assert.equal(items[0].id,la);assert.equal(items[0].quantity,1);assert.deepEqual(Object.keys(items[0].facility).sort(),['id','name','city','state','facility_type'].sort());
  for(const key of['requested_by','reviewed_by','owner_user_id','email','memberships'])assert.equal(key in items[0],false);
 });
});
test('request retry is idempotent, derives immutable facility identity and cannot self-approve or forge another facility',async()=>{
 await as(a,async()=>{const id=await request(la);assert.equal(await request(la),id);assert.equal(await scalar('select count(*)::int from public.listing_boost_requests'),1);assert.equal(await scalar('select facility_id from public.listing_boost_requests'),fa);assert.equal(await scalar('select status from public.listing_boost_requests'),'pending');await who(b);assert.equal(await scalar('select count(*)::int from public.listing_boost_requests'),0);});
 for(const sql of['update public.listing_boost_requests set status=\'approved\'','update public.listing_boost_requests set facility_id=\''+fb+'\'','insert into public.featured_listing_slots(slot,request_id,listing_id) values(1,gen_random_uuid(),\''+la+'\')'])await deny(a,sql);
 await as(a,async()=>{const id=await request(la);await assert.rejects(review(id),{code:'42501'});});
 await as(a,async()=>{const id=await request(la);await who(b);await assert.rejects(review(id),{code:'42501'});});
});
test('platform review has two bounded slots; replacement is atomic, public and retires previous placement',async()=>{
 await as(a,async()=>{
  const first=await request(la);const replacement=await request(la2);await who(b);const second=await request(lb);await who(admin);
  assert.equal((await scalar('select public.boost_review_queue()')).total,3);
  await review(first,1,'approved',1);await review(second,1,'approved',2);assert.deepEqual(await scalar('select public.public_featured_listing_ids()'),[la,lb]);
  await review(replacement,1,'approved',1);assert.deepEqual(await scalar('select public.public_featured_listing_ids()'),[la2,lb]);assert.equal(await scalar('select status from public.listing_boost_requests where id=$1',[first]),'ended');assert.equal(await scalar('select count(*)::int from public.featured_listing_slots'),2);
  await assert.rejects(review(replacement,1,'approved',2),{code:'22023'});
 });
 await as(a,async()=>{const id=await request(la);await who(admin);await assert.rejects(review(id,1,'approved',3),{code:'22023'});});
});
test('featured visibility rechecks sold, inactive, deletion and suspension, including anonymous reads',async()=>{
 for(const sql of["update public.listings set status='sold' where id=$1","update public.listings set status='inactive' where id=$1","update public.listings set deleted_at=now(),status='inactive' where id=$1","update public.facilities set status='suspended' where id=$1"]){
  await as(a,async()=>{const id=await request(la);await who(admin);await review(id);await operator(sql,[sql.includes('facilities')?fa:la]);assert.deepEqual(await scalar('select public.public_featured_inventory()'),[]);await db.exec('set local role anon');await who(null);assert.deepEqual(await scalar('select public.public_featured_listing_ids()'),[]);assert.deepEqual(await scalar('select public.public_featured_inventory()'),[]);});
 }
 await as(a,async()=>{await operator("update public.listings set status='inactive' where id=$1",[la]);await assert.rejects(request(la),{code:'22023'});});
 await as(a,async()=>{const id=await request(la);await operator("update public.listings set status='sold' where id=$1",[la]);await who(admin);await assert.rejects(review(id),{code:'22023'});});
});
test('rejection, removal, resubmission and stale reviews preserve administrative control',async()=>{
 await as(a,async()=>{const id=await request(la);await who(admin);await review(id,1,'rejected');await who(a);assert.equal(await request(la),id);assert.equal(await scalar('select revision from public.listing_boost_requests'),3);await who(admin);await review(id,3,'approved',2);await review(id,4,'ended');assert.deepEqual(await scalar('select public.public_featured_listing_ids()'),[]);});
 await deny(a,'select public.boost_review_queue()');await deny(viewer,'select public.boost_review_queue()');
 await as(a,async()=>{const id=await request(la);await operator('update private.platform_administrators set active=false where user_id=$1',[admin]);await who(admin);await assert.rejects(review(id),{code:'42501'});});
});
