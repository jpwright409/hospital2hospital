import {seedApprovedProducts} from "./helpers/catalog-fixtures.mjs";
import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {installStorageContract} from './helpers/storage.mjs';
import {deliverEmail,emailPayload} from '../scripts/email-delivery.mjs';
const db=new PGlite();const [seller,buyer,other,pending,viewer]=Array.from({length:5},()=>randomUUID());let fa,fb,fc,fp,listing;
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
async function as(user,cb,role='authenticated') {await db.exec(`begin;set local role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user??'']);try{return await cb();}finally{await db.exec('rollback');}}
const deny=(user,sql,args=[],role)=>assert.rejects(as(user,()=>db.query(sql,args),role),{code:'42501'});
const product={manufacturer:'Reference Brand',catalog_number:'SKU-1',name:'Reference equipment',description:'Equipment description',category:'Surgical Equipment',product_kind:'capital'};
const inventory={quantity:2,quantity_unit:'each',units_per_package:1,price_usd:'100.00',condition:'New / unopened',sterile:false,single_use:false,price_negotiable:true,procedure_type:'ENT'};
const create=(f,p=product,v=inventory)=>scalar('select public.create_inventory_listing($1,$2,$3)',[f,p,v]);
before(async()=>{
 await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 await installStorageContract(db);
 for(const f of(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(`../supabase/migrations/${f}`,import.meta.url),'utf8'));
 await seedApprovedProducts(db,[product,{...product,manufacturer:"Other Brand"}]);
 for(const user of[seller,buyer,other,pending,viewer]) await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[user,`${user}@example.test`]);
 const facilities=[];for(const user of[seller,buyer,other,pending]) {await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);facilities.push(await scalar("select public.onboard_facility('Test facility','City','WI','hospital',gen_random_uuid())"));}
 [fa,fb,fc,fp]=facilities;await db.query("update public.facilities set status='approved' where id=any($1::uuid[])",[[fa,fb,fc]]);
 await db.query("insert into public.facility_memberships(facility_id,user_id,role) values($1,$2,'viewer')",[fb,viewer]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[seller]);listing=await create(fa);
});
after(()=>db.close());
test('new facility types onboard pending and never grant approval',async()=>{
 for(const type of['surgical_hospital','physician_office','other']) await as(buyer,async()=>{
  const id=await scalar("select public.onboard_facility('New facility','City','WI',$1,gen_random_uuid())",[type]);
  assert.equal(await scalar('select facility_type from public.facilities where id=$1',[id]),type);assert.equal(await scalar('select status from public.facilities where id=$1',[id]),'pending');
 });
});
test('negotiable prices and seller/procedure/kind filters preserve canonical metadata',async()=>{
 await as(null,async()=>{
  const result=await scalar("select public.search_inventory_v2(p_seller_facility_id=>$1,p_procedure_type=>'ENT',p_product_kind=>'capital')",[fa]);assert.equal(result.total,1);assert.equal(result.items[0].price_negotiable,true);
  assert.equal((await scalar("select public.search_inventory_v2(p_seller_facility_id=>$1)",[fb])).total,0);
 },'anon');
 await as(seller,async()=>{const id=await create(fa,{...product,product_kind:'disposable',name:'Overwrite attempt'});const row=(await db.query('select product_kind,name from public.products where id=(select product_id from public.listings where id=$1)',[id])).rows[0];assert.equal(row.product_kind,'capital');assert.equal(row.name,product.name);});
});
test('contacts stay private; sharing is opt-in, buyer-approved and excludes secondary details',async()=>{
 await deny(null,'select * from public.facility_contacts',[],'anon');await deny(buyer,'select public.set_facility_contacts($1,$2)',[fa,{}]);
 await as(seller,async()=>{
  await db.query('select public.set_facility_contacts($1,$2)',[fa,{business_email:'business@example.test',secondary_email:'private@example.test'}]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[buyer]);assert.equal(await scalar('select public.listing_business_contact($1,$2)',[listing,fb]),null);assert.equal(await scalar('select count(*)::int from public.facility_contacts'),0);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[seller]);await db.query('select public.set_facility_contacts($1,$2)',[fa,{business_email:'business@example.test',secondary_email:'private@example.test',share_business_contact:true}]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[buyer]);const contact=await scalar('select public.listing_business_contact($1,$2)',[listing,fb]);assert.equal(contact.email,'business@example.test');assert.ok(!JSON.stringify(contact).includes('private@'));
 });
 await deny(viewer,'select public.listing_business_contact($1,$2)',[listing,fb]);await deny(pending,'select public.listing_business_contact($1,$2)',[listing,fp]);
});
test('deletion is guarded, hides inventory and prevents reactivation while preserving conversations',async()=>{
 await deny(buyer,'select public.delete_inventory_listing($1,1)',[listing]);
 await as(seller,async()=>{
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[buyer]);const thread=await scalar("select public.contact_listing_seller($1,$2,'Question',gen_random_uuid())",[listing,fb]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[seller]);await db.query('select public.delete_inventory_listing($1,1)',[listing]);
  assert.equal((await scalar('select public.search_inventory(p_facility_id=>$1)',[fa])).total,0);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[buyer]);assert.equal((await scalar('select public.conversation_page($1)',[thread])).conversation.listing_status,'inactive');
 });
 await assert.rejects(as(seller,async()=>{await db.query('select public.delete_inventory_listing($1,1)',[listing]);await db.query("select public.update_inventory_listing($1,2,'{\"status\":\"active\"}')",[listing]);}),{code:'42501'});
});
test('watchlist matches are transactional, user-private, filter exact manufacturer/catalog and queue only verified recipients',async()=>{
 await as(buyer,async()=>{
  const wid=await scalar("insert into public.watchlists(name,criteria,email_enabled) values('Watch exact',$1,true) returning id",[{manufacturer:product.manufacturer,catalog_number:'sku-1',procedure_type:'ENT',product_kind:'capital'}]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[seller]);const id=await create(fa);
  await create(fa,{...product,manufacturer:'Other Brand'});await create(fa,product,{...inventory,status:'inactive'});
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[buyer]);assert.equal(await scalar('select count(*)::int from public.watchlist_matches where watchlist_id=$1',[wid]),1);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[other]);assert.equal(await scalar('select count(*)::int from public.watchlists'),0);assert.equal(await scalar('select count(*)::int from public.watchlist_matches'),0);
  await db.exec('reset role');assert.equal(await scalar('select count(*)::int from private.email_jobs where watchlist_id=$1',[wid]),1);await db.exec('set local role service_role');const jobs=await scalar('select public.claim_email_jobs()');assert.equal(jobs.length,1);assert.equal(jobs[0].recipient,`${buyer}@example.test`);assert.equal(jobs[0].listing_id,id);
  await db.query('select public.finish_email_job($1,$2,$3)',[jobs[0].id,jobs[0].claim_token,'provider-test']);assert.equal((await scalar('select public.claim_email_jobs()')).length,0);
 });
 await deny(buyer,'select public.claim_email_jobs()');await deny(buyer,'select * from private.email_jobs');
});
test('watchlist pause/deletion and sold inventory cancel queued email; updates/reactivation never spam duplicate matches',async()=>{
 for(const mode of['pause','sold','unsubscribe','delete']) await as(buyer,async()=>{
  const wid=await scalar("insert into public.watchlists(name,criteria,email_enabled) values('Watch',$1,true) returning id",[{q:'equipment'}]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[seller]);const id=await create(fa);
  await db.query("select public.update_inventory_listing($1,1,'{\"price_usd\":\"2.00\"}')",[id]);
  if(mode==='sold') await db.query("select public.update_inventory_listing($1,2,'{\"status\":\"sold\"}')",[id]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[buyer]);
  if(mode==='pause') await db.query('update public.watchlists set enabled=false where id=$1',[wid]);
  if(mode==='unsubscribe') await db.query('update public.watchlists set email_enabled=false where id=$1',[wid]);
  if(mode==='delete') await db.query('delete from public.watchlists where id=$1',[wid]);
  await db.exec('set local role service_role');assert.equal((await scalar('select public.claim_email_jobs()')).length,0);
 });
});
test('referrals are idempotent, rate limited, require live approved membership and grant no access',async()=>{
 await deny(viewer,'select public.refer_facility($1,$2,$3)',[randomUUID(),fb,'friend@example.test']);await deny(pending,'select public.refer_facility($1,$2,$3)',[randomUUID(),fp,'friend@example.test']);
 await as(buyer,async()=>{
  const id=randomUUID();assert.equal(await scalar('select public.refer_facility($1,$2,$3)',[id,fb,'friend@example.test']),id);assert.equal(await scalar('select public.refer_facility($1,$2,$3)',[id,fb,'friend@example.test']),id);
  assert.equal(await scalar('select count(*)::int from public.facility_referrals'),1);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[other]);assert.equal(await scalar('select count(*)::int from public.facility_referrals'),0);
  await db.exec('set local role service_role');const jobs=await scalar('select public.claim_email_jobs()');assert.equal(jobs.length,1);assert.equal(jobs[0].kind,'referral');
 });
 await assert.rejects(as(buyer,async()=>{await scalar('select public.refer_facility($1,$2,$3)',[randomUUID(),fb,'friend@example.test']);await scalar('select public.refer_facility($1,$2,$3)',[randomUUID(),fb,'friend@example.test']);}),{code:'22023'});
});
test('email transport is plain text with stable provider idempotency and does not claim inbox delivery',async()=>{
 const job={id:randomUUID(),kind:'referral',recipient:'friend@example.test',payload:{referrer:'<b>Name</b>',facility:'Test Facility'}};const config={from:'Marketplace <sender@example.test>',siteUrl:'https://example.test',apiKey:'placeholder'};
 const payload=emailPayload(job,config);assert.ok(payload.text.includes('<b>Name</b>'));assert.equal(payload.html,undefined);
 let key;assert.equal(await deliverEmail(job,config,async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');key=options.headers['Idempotency-Key'];return {ok:true,json:async()=>({id:'accepted-id'})};}),'accepted-id');assert.equal(key,`h2h-email/${job.id}`);
 await assert.rejects(deliverEmail(job,config,async()=>({ok:false})),/rejected/);
});


test('onboarding with backup contact is transactional, private and idempotent',async()=>{
 await as(buyer,async()=>{
  const request=randomUUID();const id=await scalar("select public.onboard_facility_with_contacts('Office','City','WI','physician_office',$1,$2)",[request,{secondary_email:'backup@example.test'}]);
  assert.equal(await scalar('select secondary_email from public.facility_contacts where facility_id=$1',[id]),'backup@example.test');
  assert.equal(await scalar("select public.onboard_facility_with_contacts('Office','City','WI','physician_office',$1,$2)",[request,{secondary_email:'changed@example.test'}]),id);
  assert.equal(await scalar('select secondary_email from public.facility_contacts where facility_id=$1',[id]),'backup@example.test');
  assert.equal(await scalar('select count(*)::int from public.facility_memberships where facility_id=$1',[id]),1);
 });
 const request=randomUUID();await assert.rejects(as(buyer,()=>scalar("select public.onboard_facility_with_contacts('Office','City','WI','physician_office',$1,$2)",[request,{secondary_email:'bad-address'}])),{code:'22023'});
 assert.equal(await scalar('select count(*)::int from public.facilities where onboarding_request_id=$1',[request]),0);
});

test('facility listing type is editable without shared product mutation and appears in database filters',async()=>{
 await as(seller,async()=>{
  await db.query('select public.update_inventory_listing($1,1,$2)',[listing,{inventory_kind:'disposable'}]);
  assert.equal((await scalar("select public.search_inventory_v2(p_product_kind=>'disposable')")).total,1);
  assert.equal(await scalar('select product_kind from public.products where id=(select product_id from public.listings where id=$1)',[listing]),'capital');
 });
});

test('watchlist count, invalid filters, foreign ownership and ordinary match insertion are denied',async()=>{
 await deny(buyer,"insert into public.watchlists(user_id,name,criteria) values($1,'Forged',$2)",[other,{q:'equipment'}]);
 await deny(buyer,"insert into public.watchlist_matches(watchlist_id,listing_id,product_name,catalog_number) values(gen_random_uuid(),$1,'Forged','SKU')",[listing]);
 await assert.rejects(as(buyer,()=>db.query("insert into public.watchlists(name,criteria) values('Invalid',$1)",[{user_id:'abc'}])),{code:'22023'});
 await assert.rejects(as(buyer,async()=>{for(let i=0;i<21;i++) await db.query("insert into public.watchlists(name,criteria) values('Limit',$1)",[{q:'equipment'}]);}),{code:'22023'});
});

test('email worker serializes claims, retries safely and rejects stale or forged claim tokens',async()=>{
 await as(buyer,async()=>{
  await scalar('select public.refer_facility($1,$2,$3)',[randomUUID(),fb,'claim@example.test']);
  await db.exec('set local role service_role');const job=(await scalar('select public.claim_email_jobs()'))[0];
  assert.equal((await scalar('select public.claim_email_jobs()')).length,0);
  await db.query('select public.finish_email_job($1,$2,null)',[job.id,job.claim_token]);
  const retry=(await scalar('select public.claim_email_jobs()'))[0];assert.equal(retry.id,job.id);assert.notEqual(retry.claim_token,job.claim_token);
  await db.exec('savepoint expired_claim');await assert.rejects(db.query('select public.finish_email_job($1,$2,$3)',[job.id,job.claim_token,'fake']),{code:'42501'});await db.exec('rollback to savepoint expired_claim');
  await db.query('select public.finish_email_job($1,$2,$3)',[retry.id,retry.claim_token,'accepted']);
 });
});
test('saved listing notices include negotiability and facility-owned classification changes',async()=>{
 await as(buyer,async()=>{
  await db.query('insert into public.saved_listings(user_id,listing_id) values($1,$2)',[buyer,listing]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[seller]);
  await db.query('select public.update_inventory_listing($1,1,$2)',[listing,{price_negotiable:false,procedure_type:'Orthopedics',inventory_kind:'disposable'}]);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[buyer]);
  assert.deepEqual((await scalar('select public.my_saved_listing_updates()')).items[0].changes,{price_negotiable:false,procedure_type:'Orthopedics',inventory_kind:'disposable'});
 });
});
test('email claims cancel after seller suspension, Auth email change, loss of confirmation or referral membership revocation',async()=>{
 for(const mode of['seller_suspended','email_changed','unconfirmed','referrer_revoked']) await as(buyer,async()=>{
  if(mode==='referrer_revoked') await scalar('select public.refer_facility($1,$2,$3)',[randomUUID(),fb,'revocation@example.test']);
  else {
   await db.query("insert into public.watchlists(name,criteria,email_enabled) values('Eligibility',$1,true)",[{q:'equipment'}]);
   await db.query("select set_config('request.jwt.claim.sub',$1,true)",[seller]);await create(fa);
  }
  await db.exec('reset role');
  if(mode==='seller_suspended') await db.query("update public.facilities set status='suspended' where id=$1",[fa]);
  if(mode==='email_changed') await db.query("update auth.users set email='new@example.test' where id=$1",[buyer]);
  if(mode==='unconfirmed') await db.query('update auth.users set email_confirmed_at=null where id=$1',[buyer]);
  if(mode==='referrer_revoked') await db.query("update public.facility_memberships set status='revoked' where facility_id=$1 and user_id=$2",[fb,buyer]);
  await db.exec('set local role service_role');assert.equal((await scalar('select public.claim_email_jobs()')).length,0);
 });
});
test('expired queued email is never retried past provider idempotency retention',async()=>{
 await as(buyer,async()=>{
  await scalar('select public.refer_facility($1,$2,$3)',[randomUUID(),fb,'expired@example.test']);
  await db.exec('reset role');await db.exec("update private.email_jobs set created_at=clock_timestamp()-interval '24 hours'");await db.exec('set local role service_role');
  assert.equal((await scalar('select public.claim_email_jobs()')).length,0);
  await db.exec('reset role');assert.equal(await scalar("select count(*)::int from private.email_jobs where state='failed'"),1);
 });
});
