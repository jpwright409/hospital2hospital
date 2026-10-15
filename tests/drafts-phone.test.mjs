import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {installStorageContract} from './helpers/storage.mjs';
import {photoReturnPath} from '../src/lib/auth/photo-return.mjs';
const db=new PGlite();
const [a,b,c,viewer,editor,revoked,pending,admin]=Array.from({length:8},()=>randomUUID());
let fa,fb,fc,fp,draft;
let watch;
const product={manufacturer:'Draft fixture',catalog_number:'PHONE-1',name:'Draft supply',category:'General Surgery'};
const inventory={quantity:1,quantity_unit:'each',units_per_package:1,price_usd:'10',condition:'New / unopened',sterile:false,single_use:false,inventory_kind:'disposable'};
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
const who=user=>db.query("select set_config('request.jwt.claim.sub',$1,false)",[user??'']);
async function as(user,cb,role='authenticated'){await db.exec(`begin;set local role ${role}`);await who(user);try{return await cb();}finally{await db.exec('rollback');}}
const deny=(user,sql,args=[],role)=>assert.rejects(as(user,()=>db.query(sql,args),role),{code:'42501'});
const create=(fid,request=randomUUID(),p=product,i=inventory)=>scalar('select public.create_inventory_draft($1,$2,$3,$4)',[request,fid,p,i]);
before(async()=>{
 await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 await installStorageContract(db);
 for(const f of(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(`../supabase/migrations/${f}`,import.meta.url),'utf8'));
 for(const user of[a,b,c,viewer,editor,revoked,pending,admin])await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[user,`${user}@example.test`]);
 const facilities=[];for(const user of[a,b,c,pending]){await who(user);facilities.push(await scalar("select public.onboard_facility('Phone fixture','City','WI','hospital',gen_random_uuid())"));}
 [fa,fb,fc,fp]=facilities;await db.query("update public.facilities set status='approved' where id=any($1::uuid[])",[[fa,fb,fc]]);
 for(const [user,role,status]of[[viewer,'viewer','active'],[editor,'inventory_editor','active'],[revoked,'inventory_editor','revoked']])await db.query('insert into public.facility_memberships(facility_id,user_id,role,status) values($1,$2,$3,$4)',[fa,user,role,status]);
 await db.query("insert into private.platform_administrators(user_id,bootstrap_reason) values($1,'Local draft permission fixture')",[admin]);
 await who(a);draft=await create(fa);
 watch=await scalar('insert into public.watchlists(user_id,name,criteria) values($1,$2,$3) returning id',[b,'Phone catalog watch',{catalog_number:'PHONE-1'}]);
});
after(()=>db.close());

test('drafts are private through direct reads and public search, not saveable, contactable or boostable',async()=>{
 for(const [user,role] of [[null,'anon'],[b,'authenticated'],[c,'authenticated'],[viewer,'authenticated'],[admin,'authenticated']])await as(user,async()=>{
  assert.equal((await db.query('select id from public.listings where id=$1',[draft])).rows.length,0);
  assert.equal((await scalar('select public.search_inventory_v2()')).total,0);
 },role);
 await deny(b,'insert into public.saved_listings(listing_id) values($1)',[draft]);
 await assert.rejects(as(b,()=>db.query('select public.contact_listing_seller($1,$2,$3,$4)',[draft,fb,'Interested',randomUUID()])),{code:'22023'});
 await assert.rejects(as(a,()=>db.query('select public.request_listing_boost($1)',[draft])),{code:'22023'});
 await as(a,async()=>{
  const result=await scalar("select public.search_inventory_v2(p_facility_id=>$1,p_status=>'draft')",[fa]);assert.equal(result.total,1);assert.equal(result.items[0].status,'draft');
 });
});

test('draft creation is transactional, forces private status and deduplicates unchanged retries',async()=>{
 await as(a,async()=>{
  const request=randomUUID();const id=await create(fa,request,product,{...inventory,status:'active'});
  assert.equal(await scalar('select status from public.listings where id=$1',[id]),'draft');
  assert.equal(await create(fa,request,product,{...inventory,status:'active'}),id);
  await create(fa,randomUUID(),{...product,name:'Do not overwrite shared name'});
  assert.equal(await scalar('select name from public.products where catalog_number=$1',['PHONE-1']),product.name);
  assert.equal(await scalar('select count(*) from public.watchlist_matches where watchlist_id=$1',[watch]),0);
 });
 await assert.rejects(as(a,async()=>{const request=randomUUID();await create(fa,request);await create(fa,request,product,{...inventory,quantity:2});}),{code:'42501'});
 const beforeCount=await scalar('select count(*) from public.products');
 await assert.rejects(as(a,()=>create(fa,randomUUID(),{...product,catalog_number:'ROLLBACK-PHONE'},{...inventory,quantity:0})));
 assert.equal(await scalar('select count(*) from public.products'),beforeCount);
 await deny(a,'select * from private.listing_draft_requests');
});

test('pending, suspended, revoked, viewer and unrelated platform administration cannot create or manage drafts',async()=>{
 for(const [user,fid]of[[pending,fp],[b,fa],[viewer,fa],[revoked,fa],[admin,fa]])await deny(user,'select public.create_inventory_draft($1,$2,$3,$4)',[randomUUID(),fid,product,inventory]);
 await db.query("update public.facilities set status='suspended' where id=$1",[fc]);
 await deny(c,'select public.create_inventory_draft($1,$2,$3,$4)',[randomUUID(),fc,product,inventory]);
 for(const user of[b,c,viewer,revoked,admin])await deny(user,'select public.reserve_listing_photo_once($1,$2)',[draft,randomUUID()]);
 await deny(null,'select public.create_inventory_draft($1,$2,$3,$4)',[randomUUID(),fa,product,inventory],'anon');
 await as(editor,async()=>assert.ok(await create(fa)));
});

test('phone uploads use exact reservation ownership; pending retries and request forgery cannot create extra slots',async()=>{
 await as(a,async()=>{
  const submission=randomUUID();const photo=await scalar('select public.reserve_listing_photo_once($1,$2)',[draft,submission]);
  assert.ok(photo.object_path.startsWith(`${fa}/${draft}/`));
 });
 await assert.rejects(as(a,async()=>{const request=randomUUID();await scalar('select public.reserve_listing_photo_once($1,$2)',[draft,request]);await scalar('select public.reserve_listing_photo_once($1,$2)',[draft,request]);}),{code:'22023'});
 await deny(b,"insert into storage.objects(bucket_id,name,metadata) values('listing-photos',$1,$2)",[`${fa}/${draft}/${randomUUID()}.webp`,{mimetype:'image/webp',size:100}]);
 await as(null,async()=>assert.equal((await db.query('select id from public.listing_photos where listing_id=$1',[draft])).rows.length,0),'anon');
});

test('ready-upload retries return the same photo without upload or public draft-photo access',async()=>{
 await who(a);const request=randomUUID();const photo=await scalar('select public.reserve_listing_photo_once($1,$2)',[draft,request]);
 await db.query("insert into storage.objects(bucket_id,name,metadata) values('listing-photos',$1,$2)",[photo.object_path,{mimetype:'image/webp',size:100}]);
 await db.query('select public.finalize_listing_photo($1,100,100,100)',[photo.id]);
 await as(a,async()=>assert.deepEqual(await scalar('select public.reserve_listing_photo_once($1,$2)',[draft,request]),{id:photo.id,object_path:photo.object_path,state:'ready'}));
 await deny(editor,'select public.reserve_listing_photo_once($1,$2)',[draft,request]);
 await as(null,async()=>{assert.equal(await scalar('select public.photo_can_read($1)',[draft]),false);assert.equal((await db.query('select * from storage.objects where name=$1',[photo.object_path])).rows.length,0);},'anon');
});

test('publishing preserves photos and identity; stale revisions, ownership transfers and revoked publication fail',async()=>{
 await deny(a,'select public.update_inventory_listing($1,1,$2)',[draft,{facility_id:fb,status:'active'}]);
 await assert.rejects(as(a,()=>db.query('select public.update_inventory_listing($1,999,$2)',[draft,{status:'active'}])),{code:'22023'});
 await as(a,async()=>{await db.query('select public.update_inventory_listing($1,1,$2)',[draft,{status:'active'}]);assert.equal(await scalar('select public.photo_can_read($1)',[draft]),true);});
 // Operator observes the trigger result inside a rolled-back publication transaction.
 await db.exec('begin');try{await who(a);await db.query('select public.update_inventory_listing($1,1,$2)',[draft,{status:'active'}]);assert.equal(await scalar('select count(*) from public.watchlist_matches where watchlist_id=$1',[watch]),1);}finally{await db.exec('rollback');}
 await db.query("update public.facility_memberships set status='revoked' where user_id=$1 and facility_id=$2",[a,fa]);
 await deny(a,'select public.update_inventory_listing($1,1,$2)',[draft,{status:'active'}]);
 await deny(a,'select public.reserve_listing_photo_once($1,$2)',[draft,randomUUID()]);
 await db.query("update public.facility_memberships set status='active' where user_id=$1 and facility_id=$2",[a,fa]);
 await db.query("update public.facilities set status='suspended' where id=$1",[fa]);
 await deny(editor,'select public.reserve_listing_photo_once($1,$2)',[draft,randomUUID()]);
 await db.query("update public.facilities set status='approved' where id=$1",[fa]);
});

test('phone photo access is independent of active facility and still rejects unconfirmed accounts',async()=>{
 await db.query("insert into public.facility_memberships(facility_id,user_id,role,status) values($1,$2,'inventory_editor','active')",[fb,a]);
 await as(a,async()=>{await db.query('select public.set_active_facility($1)',[fb]);assert.equal(await scalar('select public.photo_can_manage($1)',[draft]),true);await db.query('select public.reserve_listing_photo_once($1,$2)',[draft,randomUUID()]);assert.equal(await scalar('select active_facility_id from public.profiles where id=$1',[a]),fb);});
 await db.query('update auth.users set email_confirmed_at=null where id=$1',[editor]);
 await deny(editor,'select public.create_inventory_draft($1,$2,$3,$4)',[randomUUID(),fa,product,inventory]);
 await deny(editor,'select public.reserve_listing_photo_once($1,$2)',[draft,randomUUID()]);
 await db.query('update auth.users set email_confirmed_at=now() where id=$1',[editor]);
});

test('phone login return path rejects external, encoded, nested and arbitrary redirect destinations',()=>{
 const path=`/listings/${randomUUID()}/photos`;assert.equal(photoReturnPath(path),path);
 for(const value of ['https://evil.test','//evil.test',path+'?next=https://evil.test',path+'/../edit','/account','%2F%2Fevil.test',null,['/account']])assert.equal(photoReturnPath(value),'/marketplace');
});
