import {seedApprovedProducts} from "./helpers/catalog-fixtures.mjs";
import { PGlite } from "@electric-sql/pglite";
import { readFile,readdir } from "node:fs/promises";
import { test,before,after } from "node:test";
import assert from "node:assert/strict";
import { readCatalog,catalogSql } from "../scripts/catalog-import.mjs";
import { parseInventoryQuery,inventoryUrl,validateInventory } from "../src/lib/inventory/types.ts";
import { installStorageContract } from "./helpers/storage.mjs";
const db=new PGlite();
const users=Array.from({length:7},(_,i)=>`10000000-0000-4000-8000-${String(i+1).padStart(12,"0")}`);
const [a,b,pending,suspended,editor,viewer,admin]=users;
let fa,fb,fp,fs,active,inactive,sold;
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
async function as(user,callback,role="authenticated") {
  await db.exec(`begin;set local role ${role};`);
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user ?? ""]);
  try{return await callback();}finally{await db.exec("rollback");}
}
const deny=(user,sql,args=[],role)=>assert.rejects(as(user,()=>db.query(sql,args),role),{code:"42501"});
const product={manufacturer:"Example Manufacturer",catalog_number:"CAT-001",name:"Reference device",category:"General Surgery",description:"Product example"};
const inventory={quantity:3,quantity_unit:"box",units_per_package:5,price_usd:"12.50",condition:"New / unopened",sterile:true,single_use:true,packaging:"Original box",notes:"",status:"active"};
const create=(facility,p=product,l=inventory)=>scalar("select public.create_inventory_listing($1,$2,$3)",[facility,p,l]);
const update=(id,payload,revision=1)=>db.query("select public.update_inventory_listing($1,$2,$3)",[id,revision,payload]);
before(async()=>{
  await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
    create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  await installStorageContract(db);
  for(const file of (await readdir(new URL("../supabase/migrations/",import.meta.url))).filter(f=>f.endsWith(".sql")).sort()) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),"utf8"));
  await seedApprovedProducts(db,[product,{...product,manufacturer:"Other Manufacturer"},{...product,catalog_number:"EDITOR-NEW"}]);
  for(const user of users) await db.query("insert into auth.users(id,email_confirmed_at) values($1,now())",[user]);
  const facilities=[];
  for(const user of [a,b,pending,suspended]) {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
    facilities.push(await scalar("select public.onboard_facility('Test facility','Madison','WI','hospital',gen_random_uuid())"));
  }
  [fa,fb,fp,fs]=facilities;
  await db.query("update public.facilities set status='approved' where id=any($1::uuid[])",[[fa,fb,fs]]);
  await db.query("insert into public.facility_memberships(facility_id,user_id,role) values($1,$2,'inventory_editor'),($1,$3,'viewer')",[fa,editor,viewer]);
  await db.query("insert into private.platform_administrators(user_id,bootstrap_reason) values($1,'Local test bootstrap only')",[admin]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
  active=await create(fa);inactive=await create(fa,product,{...inventory,status:"inactive"});sold=await create(fa,product,{...inventory,status:"sold"});
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[b]);await create(fb,{...product,manufacturer:"Other Manufacturer"});
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[suspended]);await create(fs);
  await db.query("update public.facilities set status='suspended' where id=$1",[fs]);
  await db.query("insert into public.saved_listings(user_id,listing_id) values($1,$2),($1,$3),($4,$2)",[a,active,inactive,b]);
  await db.query("select set_config('request.jwt.claim.sub','',false)");
});
after(()=>db.close());
test("anonymous public reads include only active approved stock and safe facility fields",async()=>{
  await as(null,async()=>{
    const result=await scalar("select public.search_inventory()");
    assert.equal(result.total,2);
    assert.deepEqual(Object.keys(result.items[0].facility).sort(),["city","facility_type","id","name","state"]);
    assert.equal(await scalar("select count(*)::int from public.listings"),2);
    assert.equal(await scalar("select public.marketplace_facility($1)",[fp]),null);
  },"anon");
  await deny(null,"select * from public.facilities",[],"anon");
  await deny(null,"select * from public.saved_listings",[],"anon");
  await deny(null,"select public.create_inventory_listing($1,$2,$3)",[fa,product,inventory],"anon");
});
test("unrelated facilities cannot read private inventory or edit each other's listings",async()=>{
  await as(b,async()=>{
    assert.equal(await scalar("select count(*)::int from public.listings where id=any($1::uuid[])",[[inactive,sold]]),0);
    await assert.rejects(update(active,{status:"sold"}),{code:"42501"});
  });
  await deny(b,"select public.search_inventory(p_facility_id=>$1)",[fa]);
  await deny(admin,"select public.update_inventory_listing($1,1,'{\"status\":\"sold\"}')",[active]);
});
test("approved owner and inventory editor manage stock; viewer and admin alone cannot",async()=>{
  for(const user of [a,editor]) await as(user,async()=>{
    assert.equal((await scalar("select public.search_inventory(p_facility_id=>$1)",[fa])).total,3);
    await update(inactive,{status:"active"});
    assert.equal(await scalar("select status from public.listings where id=$1",[inactive]),"active");
    await update(inactive,{status:"sold"},2);
    assert.equal(await scalar("select status from public.listings where id=$1",[inactive]),"sold");
    await create(fa,{...product,catalog_number:"EDITOR-NEW"});
  });
  await deny(viewer,"select public.create_inventory_listing($1,$2,$3)",[fa,product,inventory]);
  await as(editor,async()=>{
    await db.exec("reset role");await db.query("update public.facility_memberships set role='administrator' where user_id=$1",[editor]);await db.exec("set local role authenticated");
    await assert.rejects(create(fa),{code:"42501"});
  });
});
test("pending, rejected, suspended and revoked contexts cannot modify or publish",async()=>{
  for(const user of [pending,suspended]) await deny(user,"select public.create_inventory_listing($1,$2,$3)",[user===pending ? fp : fs,product,inventory]);
  await as(suspended,async()=>{
    const owned=await scalar("select id from public.listings where facility_id=$1",[fs]);
    await assert.rejects(update(owned,{status:"active"}),{code:"42501"});
  });
  await as(a,async()=>{
    await db.exec("reset role");await db.query("update public.facilities set status='rejected' where id=$1",[fa]);await db.exec("set local role authenticated");
    assert.equal((await scalar("select public.search_inventory(p_facility_id=>$1)",[fa])).total,3);
    await assert.rejects(update(active,{quantity:2}),{code:"42501"});
  });
  await as(a,async()=>{
    await db.exec("reset role");await db.query("update public.facility_memberships set status='revoked' where user_id=$1",[a]);await db.exec("set local role authenticated");
    assert.equal(await scalar("select count(*)::int from public.listings where id=$1",[inactive]),0);
    await assert.rejects(update(active,{status:"inactive"}),{code:"42501"});
  });
});
test("direct API writes, ownership/product transfers, and shared product edits are denied",async()=>{
  for(const sql of ["update public.listings set facility_id=$1 where id=$2","update public.listings set product_id=$1 where id=$2"]) await deny(a,sql,[fb,active]);
  await deny(a,"update public.products set name='Attack'");await deny(a,"update public.manufacturers set name='Attack'");
  await deny(a,"delete from public.listings where id=$1",[active]);
  await deny(a,"insert into public.listings(facility_id,product_id,quantity,quantity_unit,units_per_package,price_usd,condition) values($1,gen_random_uuid(),1,'each',1,1,'New / unopened')",[fa]);
  await deny(a,"insert into public.products(manufacturer_id,catalog_number,name,category) values(gen_random_uuid(),'X','Attack','Test')");
  await deny(a,"select public.update_inventory_listing($1,1,$2)",[active,{facility_id:fb}]);
  await deny(a,"select public.update_inventory_listing($1,1,$2)",[active,{product_id:fb}]);
  await as(a,async()=>{
    const id=await create(fa,{...product,manufacturer:"  EXAMPLE   MANUFACTURER  ",catalog_number:" cat-001 ",name:"Unauthorized overwrite"});
    assert.equal(await scalar("select name from public.products where id=(select product_id from public.listings where id=$1)",[id]),product.name);
    assert.equal(await scalar("select count(*)::int from public.products where normalized_catalog_number='cat-001'"),2);
  });
});
test("invalid inventory leaves approved catalog intact; concurrent edit revision is enforced",async()=>{
  const before=await scalar("select count(*)::int from public.products");
  await assert.rejects(as(a,()=>create(fa,product,{...inventory,quantity:0})),{code:"23514"});
  assert.equal(await scalar("select count(*)::int from public.products"),before);
  await assert.rejects(as(a,()=>update(active,{notes:"stale"},99)),{code:"22023"});
  await assert.rejects(as(a,()=>create(fa,product,{...inventory,price_usd:"1.005"})),{code:"22023"});
});
test("saved listings are private, actor-owned, and cannot save unavailable stock",async()=>{
  await as(a,async()=>{
    assert.equal(await scalar("select count(*)::int from public.saved_listings"),2);
    assert.equal(await scalar("select count(*)::int from public.saved_listings where user_id=$1",[b]),0);
    const result=await scalar("select public.search_inventory(p_saved=>true)");assert.equal(result.total,1);
    assert.deepEqual(await scalar("select public.unavailable_saved_listings()"),[{listing_id:inactive}]);
    await db.query("delete from public.saved_listings where listing_id=$1",[inactive]);
  });
  await deny(b,"insert into public.saved_listings(user_id,listing_id) values($1,$2)",[a,sold]);
  await deny(b,"insert into public.saved_listings(user_id,listing_id) values($1,$2)",[b,inactive]);
  await as(b,async()=>assert.equal((await db.query("delete from public.saved_listings where user_id=$1 returning *",[a])).rows.length,0));
  await as(b,async()=>assert.deepEqual(await scalar("select public.unavailable_saved_listings()"),[]));
  await deny(null,"select public.unavailable_saved_listings()",[],"anon");
});
test("database filters, sorting, pagination and literal search operate on stock only",async()=>{
  await as(null,async()=>{
    const manufacturer = await scalar("select id from public.manufacturers where name='Example Manufacturer'");
    assert.equal((await scalar("select public.search_inventory(p_query=>'cat-001',p_location=>'wi',p_manufacturer=>$1)",[manufacturer])).total,1);
    assert.equal((await scalar("select public.search_inventory(p_query=>'%',p_category=>'General Surgery')")).total,0);
    const page=await scalar("select public.search_inventory(p_page_size=>1,p_page=>2,p_sort=>'price_low')");assert.equal(page.total,2);assert.equal(page.items.length,1);
  },"anon");
  await assert.rejects(as(null,()=>scalar("select public.search_inventory(p_page_size=>null)"),"anon"),{code:"22023"});
});
test("reference workbook import is repeatable, deduplicated, and creates no stock",async()=>{
  const result=await readCatalog(new URL("../project_sources/RevMed_SKU_Category_Brand_Reference_v2.xlsx",import.meta.url));
  assert.equal(result.summary.source_rows,122);assert.equal(result.summary.unique_products,61);assert.equal(result.summary.duplicate_rows,61);
  assert.ok(result.products.some(p=>p.gtin));
  const stockBefore=await scalar("select count(*)::int from public.listings");
  await db.exec(catalogSql(result.products));const count=await scalar("select count(*)::int from public.products");
  await db.exec(catalogSql(result.products));assert.equal(await scalar("select count(*)::int from public.products"),count);
  assert.equal(await scalar("select count(*)::int from public.listings"),stockBefore);
});
test("URL state and quantity/USD input validation handle invalid and package inputs",()=>{
  const query=parseInventoryQuery({q:"CAT-001",category:"General Surgery",location:"WI",sort:"price_high",page:"2"});
  const url=inventoryUrl("/marketplace",query,3);assert.match(url,/page=3/);assert.match(url,/sort=price_high/);assert.match(url,/q=CAT-001/);
  assert.equal(parseInventoryQuery({page:"NaN",sort:"hack"}).page,1);
  const form=new FormData();for(const [key,value] of Object.entries(inventory)) form.set(key,String(value));
  assert.equal(validateInventory(form).units_per_package,5);form.set("quantity_unit","each");assert.throws(()=>validateInventory(form),/exactly 1/);
  form.set("units_per_package","1");form.set("price_usd","12.501");assert.throws(()=>validateInventory(form),/two decimal/);
});


test('saved listing notices capture actual public changes transactionally, without no-op or retroactive alerts',async()=>{
  await as(a,async()=>{
    assert.equal(await scalar('select public.my_saved_listing_update_count()'),0);
    await update(active,{quantity:9,price_usd:'8.00',quantity_unit:'case',units_per_package:10});
    const result=await scalar('select public.my_saved_listing_updates()');
    assert.equal(result.total,1);assert.equal(result.unread,1);
    assert.deepEqual(result.items[0].changes,{quantity:9,price_usd:8,quantity_unit:'case',units_per_package:10});
    await update(active,{quantity:9,price_usd:'8.00'},2);
    assert.equal(await scalar('select public.my_saved_listing_update_count()'),1);
    await update(active,{notes:'Additional public details'},3);
    const latest=await scalar('select public.my_saved_listing_updates()');
    assert.deepEqual(latest.items[0].changes,{details_updated:true});
    assert.ok(!JSON.stringify(latest).includes('Additional public details'));
  });
  await assert.rejects(as(a,()=>update(active,{quantity:10,price_usd:'-1.00'})),{code:'23514'});
  await as(a,async()=>assert.equal(await scalar('select public.my_saved_listing_update_count()'),0));
});

test('sold/deactivated notices contain only status; later private edits cannot leak stock into alerts',async()=>{
  for(const status of ['sold','inactive']) await as(a,async()=>{
    await update(active,{status,quantity:50,price_usd:'1000.00'});
    assert.deepEqual((await scalar('select public.my_saved_listing_updates()')).items[0].changes,{status});
    await update(active,{quantity:99,price_usd:'2000.00',notes:'Private internal notes'},2);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[b]);
    const result=await scalar('select public.my_saved_listing_updates()');
    assert.equal(result.total,1);assert.equal(result.items[0].public_available,false);
    assert.ok(!JSON.stringify(result).includes('2000'));assert.ok(!JSON.stringify(result).includes('Private internal notes'));
    assert.equal(await scalar('select count(*)::int from public.listings where id=$1',[active]),0);
  });
});

test('saved notification RLS, marking and direct writes are private even for facility owners and platform admins',async()=>{
  await deny(null,'select * from public.saved_listing_updates',[],'anon');
  await deny(null,'select public.my_saved_listing_update_count()',[],'anon');
  await deny(b,'update public.saved_listing_updates set read_at=now()');
  await deny(b,'delete from public.saved_listing_updates');
  await deny(b,"insert into public.saved_listing_updates(user_id,listing_id,listing_revision,product_name,catalog_number,changes) values($1,$2,1,'Forged','X','{}')",[b,active]);
  await as(a,async()=>{
    await update(active,{price_usd:'2.00'});
    const own=(await scalar('select public.my_saved_listing_updates()')).items[0];
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[b]);
    const theirs=(await scalar('select public.my_saved_listing_updates()')).items[0];
    assert.notEqual(theirs.id,own.id);
    assert.equal(await scalar('select count(*)::int from public.saved_listing_updates where user_id=$1',[a]),0);
    await db.exec('savepoint denied_notification');
    await assert.rejects(db.query('select public.mark_saved_listing_updates_read($1::uuid[])',[[theirs.id,own.id]]),{code:'42501'});
    await db.exec('rollback to savepoint denied_notification');
    assert.equal(await scalar('select public.my_saved_listing_update_count()'),1);
    await db.query('select public.mark_saved_listing_updates_read($1::uuid[])',[[theirs.id]]);
    await db.query('select public.mark_saved_listing_updates_read($1::uuid[])',[[theirs.id]]);
    assert.equal(await scalar('select public.my_saved_listing_update_count()'),0);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[a]);
    assert.equal(await scalar('select public.my_saved_listing_update_count()'),1);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[admin]);
    assert.deepEqual((await scalar('select public.my_saved_listing_updates()')).items,[]);
  });
});

test('unsaving deletes only that user listing notification history and resaving does not replay old changes',async()=>{
  await as(a,async()=>{
    await update(active,{quantity:4});
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[b]);
    await db.query('delete from public.saved_listings where user_id=$1 and listing_id=$2',[b,active]);
    assert.equal(await scalar('select public.my_saved_listing_update_count()'),0);
    await db.query('insert into public.saved_listings(user_id,listing_id) values($1,$2)',[b,active]);
    assert.equal(await scalar('select public.my_saved_listing_update_count()'),0);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[a]);
    assert.equal(await scalar('select public.my_saved_listing_update_count()'),1);
    await update(active,{price_usd:'4.00'},2);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[b]);
    assert.equal(await scalar('select public.my_saved_listing_update_count()'),1);
  });
});

test('notifications remain independent of facility membership and private/suspended edits produce no events',async()=>{
  await as(a,async()=>{
    await update(inactive,{quantity:7});
    assert.equal(await scalar('select public.my_saved_listing_update_count()'),0);
    await update(active,{quantity:4});
    await db.exec('reset role');
    await db.query("update public.facility_memberships set status='revoked' where user_id=$1",[b]);
    await db.query("update public.facilities set status='suspended' where id=$1",[fa]);
    await db.query('update public.listings set quantity=500,revision=revision+1 where id=$1',[active]);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[b]);await db.exec('set local role authenticated');
    const result=await scalar('select public.my_saved_listing_updates()');
    assert.equal(result.total,1);assert.equal(result.items[0].changes.quantity,4);assert.equal(result.items[0].public_available,false);
  });
});

test('saved update pagination and bounded read requests do not clear undisplayed newer notices',async()=>{
  await as(a,async()=>{
    for(let i=0;i<22;i++) await update(active,{quantity:10+i},1+i);
    const first=await scalar('select public.my_saved_listing_updates(1)');
    const older=await scalar('select public.my_saved_listing_updates(2)');
    assert.equal(first.items.length,20);assert.equal(older.items.length,2);assert.equal(first.total,22);
    assert.equal(new Set([...first.items,...older.items].map(n=>n.id)).size,22);
    await db.query('select public.mark_saved_listing_updates_read($1::uuid[])',[first.items.map(n=>n.id)]);
    assert.equal(await scalar('select public.my_saved_listing_update_count()'),2);
    await update(active,{quantity:60},23);
    assert.equal(await scalar('select public.my_saved_listing_update_count()'),3);
  });
  await assert.rejects(as(a,()=>scalar('select public.my_saved_listing_updates(0)')),{code:'22023'});
  await assert.rejects(as(a,()=>db.query('select public.mark_saved_listing_updates_read($1::uuid[])',[[]])),{code:'22023'});
});
