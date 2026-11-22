import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {installStorageContract} from './helpers/storage.mjs';
import {seedApprovedProducts} from './helpers/catalog-fixtures.mjs';
const db=new PGlite(),seller=randomUUID(),buyer=randomUUID(),other=randomUUID();let facility;
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
async function as(user,cb,role='authenticated'){await db.exec(`begin;set local role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user??'']);try{return await cb();}finally{await db.exec('rollback');}}
const product={manufacturer:'Watch Reference',catalog_number:'SHARED-SKU',name:'Watch test equipment',description:'Reference only',category:'Equipment',product_kind:'capital'};
const stock={quantity:2,quantity_unit:'each',units_per_package:1,price_usd:'100.00',condition:'New / unopened',sterile:false,single_use:false,price_negotiable:true,procedure_type:'ENT'};
const create=(price,negotiable=true,p=product)=>scalar('select public.create_inventory_listing($1,$2,$3)',[facility,p,{...stock,price_usd:price,price_negotiable:negotiable}]);
const watch=criteria=>scalar("insert into public.watchlists(name,criteria,email_enabled) values('Price watch',$1,true) returning id",[criteria]);
before(async()=>{
 await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);await installStorageContract(db);
 for(const file of(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8'));
 for(const id of[seller,buyer,other])await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id,id+'@example.test']);
 await seedApprovedProducts(db,[product,{...product,manufacturer:'Other Reference'}]);await db.query("select set_config('request.jwt.claim.sub',$1,false)",[seller]);
 facility=await scalar(`select public.onboard_facility_with_registration('Test facility','City','TX','hospital',gen_random_uuid(),'{}','{"facility_npi":"1234567893","authorized_facility":true,"terms_accepted":true,"terms_version":"placeholder-2026-11-04"}')`);await db.query("update public.facilities set status='approved' where id=$1",[facility]);
});after(()=>db.close());
test('watchlist bounds validate at the database boundary without expanding ownership or private access',async()=>{
 for(const criteria of[{min_price:'-1'},{max_price:'NaN'},{min_price:'1e2'},{min_price:'1.001'},{min_price:'100',max_price:'99'},{max_price:'10000000000'},{negotiable:'false'},{min_price:100},{unexpected:'yes'}])await assert.rejects(as(buyer,()=>watch(criteria)),{code:'22023'});
 await as(buyer,async()=>{for(const criteria of[{min_price:'0'},{max_price:'0'},{min_price:'9999999999.99',max_price:'9999999999.99'},{negotiable:'yes'},{q:'equipment'}])assert.ok(await watch(criteria));const id=await watch({min_price:'1'});await db.query("select set_config('request.jwt.claim.sub',$1,true)",[other]);assert.equal(await scalar('select count(*)::int from public.watchlists where id=$1',[id]),0);assert.equal((await db.query('update public.watchlists set criteria=$1 where id=$2 returning id',[{min_price:'2'},id])).rows.length,0);});
 await assert.rejects(as(null,()=>watch({min_price:'0'}),'anon'),{code:'42501'});await assert.rejects(as(buyer,()=>db.query('select private.watchlist_price_matches($1,1,true)',[{}])),{code:'42501'});
});
test('inclusive range and negotiable AND filters match new stock only, preserve exact manufacturer/SKU identity',async()=>{
 await as(buyer,async()=>{const wid=await watch({catalog_number:'SHARED-SKU',manufacturer:'Watch Reference',min_price:'50.50',max_price:'100',negotiable:'yes'});await db.query("select set_config('request.jwt.claim.sub',$1,true)",[seller]);
  const expected=[await create('50.50'),await create('100')];await create('50.49');await create('100.01');await create('75',false);await create('75',true,{...product,manufacturer:'Other Reference'});
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[buyer]);assert.deepEqual((await db.query('select listing_id from public.watchlist_matches where watchlist_id=$1 order by listing_id',[wid])).rows.map(r=>r.listing_id).sort(),expected.sort());await db.exec('reset role');assert.equal(await scalar('select count(*)::int from private.email_jobs where watchlist_id=$1',[wid]),2);
 });
});
test('open bounds include zero and unchanged old watchlists still match; no retrospective matches or duplicate emails',async()=>{
 await as(seller,async()=>{const old=await create('20');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[buyer]);const wid=await watch({max_price:'0'}),legacy=await watch({catalog_number:'SHARED-SKU'});assert.equal(await scalar('select count(*)::int from public.watchlist_matches'),0);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[seller]);const id=await create('0');await db.query('select public.update_inventory_listing($1,1,$2)',[id,{price_usd:'0'}]);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[buyer]);assert.equal(await scalar('select count(*)::int from public.watchlist_matches where watchlist_id=$1',[wid]),1);assert.equal(await scalar('select count(*)::int from public.watchlist_matches where watchlist_id=$1',[legacy]),1);assert.equal(await scalar('select count(*)::int from public.watchlist_matches where listing_id=$1',[old]),0);});
});
test('every worker version cancels pending alerts when current price, negotiability or watch criteria no longer match',async()=>{
 for(const rpc of['claim_email_jobs','claim_email_jobs_v2','claim_email_jobs_v3'])for(const change of['price','negotiable','criteria'])await as(buyer,async()=>{const wid=await watch({min_price:'50',max_price:'100',negotiable:'yes'});await db.query("select set_config('request.jwt.claim.sub',$1,true)",[seller]);const id=await create('75');if(change!=='criteria')await db.query('select public.update_inventory_listing($1,1,$2)',[id,change==='price'?{price_usd:'101'}:{price_negotiable:false}]);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[buyer]);if(change==='criteria')await db.query('update public.watchlists set criteria=$1 where id=$2',[{max_price:'50'},wid]);await db.exec('set local role service_role');assert.equal((await scalar('select public.'+rpc+'()')).length,0);await db.exec('reset role');assert.equal(await scalar('select state from private.email_jobs where listing_id=$1',[id]),'cancelled');});
});
test('disabled and unconfirmed accounts cannot save filters; capability is not anonymous',async()=>{
 await db.query('insert into private.account_controls(user_id,disabled) values($1,true)',[other]);await assert.rejects(as(other,()=>watch({min_price:'0'})),{code:'42501'});await db.query('delete from private.account_controls where user_id=$1',[other]);await db.query('update auth.users set email_confirmed_at=null where id=$1',[other]);await assert.rejects(as(other,()=>watch({min_price:'0'})),{code:'42501'});await as(buyer,async()=>assert.equal(await scalar('select public.watchlist_price_filters_available()'),true));await assert.rejects(as(null,()=>scalar('select public.watchlist_price_filters_available()'),'anon'),{code:'42501'});
});
