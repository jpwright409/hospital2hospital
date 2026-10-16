import {seedApprovedProducts} from "./helpers/catalog-fixtures.mjs";
import {PGlite} from "@electric-sql/pglite";
import {readFile,readdir} from "node:fs/promises";
import {test,before,after} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {installStorageContract} from "./helpers/storage.mjs";
const db=new PGlite();
const [a,b,c,pending,viewer,facilityAdmin,editor,platform]=Array.from({length:8},(_,i)=>`50000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`);
let fa,fb,fc,fp,listing,otherListing,conversation,otherConversation,photo;
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
async function as(user,callback,role='authenticated') {
  await db.exec(`begin;set local role ${role};`);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user ?? '']);
  try{return await callback();}finally{await db.exec('rollback');}
}
const denied=(user,sql,args=[],role='authenticated')=>assert.rejects(as(user,()=>db.query(sql,args),role),{code:'42501'});
const reserve=id=>scalar('select public.reserve_listing_photo($1)',[id]);
const contact=(id,facility,body='Is this available?',request=randomUUID())=>scalar('select public.contact_listing_seller($1,$2,$3,$4)',[id,facility,body,request]);
const reply=(id,facility,body='Reply',request=randomUUID())=>scalar('select public.reply_to_conversation($1,$2,$3,$4)',[id,facility,body,request]);
before(async()=>{
  await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;
    create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
  await installStorageContract(db);
  for(const file of (await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort()) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),'utf8'));
  for(const user of [a,b,c,pending,viewer,facilityAdmin,editor,platform]) await db.query('insert into auth.users(id,email_confirmed_at) values($1,now())',[user]);
  const facilities=[];
  for(const user of [a,b,c,pending]) {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);
    facilities.push(await scalar("select public.onboard_facility('Facility test','City','WI','hospital',gen_random_uuid())"));
  }
  [fa,fb,fc,fp]=facilities;
  await db.query("update public.facilities set status='approved' where id=any($1::uuid[])",[[fa,fb,fc]]);
  await db.query("insert into public.facility_memberships(facility_id,user_id,role) values($1,$2,'viewer'),($1,$3,'administrator'),($4,$5,'inventory_editor')",[fb,viewer,facilityAdmin,fa,editor]);
  await db.query("insert into private.platform_administrators(user_id,bootstrap_reason) values($1,'Test operator bootstrap')",[platform]);
  await seedApprovedProducts(db,[{manufacturer:'Test Brand',catalog_number:'PHOTO-001',name:'Photo reference',category:'General Surgery'}]);
  const product={manufacturer:'Test Brand',catalog_number:'PHOTO-001',name:'Photo reference',category:'General Surgery'};
  const inventory={quantity:2,quantity_unit:'each',units_per_package:1,price_usd:'10.00',condition:'New / unopened',sterile:true,single_use:true};
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[a]);
  listing=await scalar('select public.create_inventory_listing($1,$2,$3)',[fa,product,inventory]);
  photo=await reserve(listing);
  await db.query("insert into storage.objects(bucket_id,name,metadata) values('listing-photos',$1,$2)",[photo.object_path,{mimetype:'image/webp',size:100}]);
  await db.query('select public.finalize_listing_photo($1,100,100,100)',[photo.id]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[c]);
  otherListing=await scalar('select public.create_inventory_listing($1,$2,$3)',[fc,product,inventory]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[b]);
  conversation=await contact(listing,fb);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)",[c]);otherConversation=await contact(listing,fc);
  await db.query("select set_config('request.jwt.claim.sub','',false)");
});
after(()=>db.close());
test('private photo bucket limits and public ready-photo reads without uploader identity',async()=>{
  const bucket=(await db.query("select * from storage.buckets where id='listing-photos'")).rows[0];
  assert.equal(bucket.public,false);assert.equal(Number(bucket.file_size_limit),5242880);assert.deepEqual(bucket.allowed_mime_types,['image/jpeg','image/png','image/webp']);
  await as(null,async()=>{
    assert.equal(await scalar("select count(*)::int from public.listing_photos where state='ready'"),1);
    assert.equal(await scalar("select count(*)::int from storage.objects where name=$1",[photo.object_path]),1);
  },'anon');
  await denied(null,'select created_by from public.listing_photos',[],'anon');
});
test('photo ownership across three facilities and forged paths are rejected by actual Storage RLS',async()=>{
  for(const user of [b,c]) {
    await denied(user,'select public.reserve_listing_photo($1)',[listing]);
    await denied(user,'select public.remove_listing_photo($1)',[photo.id]);
    await denied(user,'select public.arrange_listing_photos($1,$2,$3)',[listing,[photo.id],photo.id]);
  }
  await denied(a,"insert into storage.objects(bucket_id,name) values('listing-photos',$1)",[`${fa}/${otherListing}/${randomUUID()}.webp`]);
  await as(a,async()=>assert.equal((await db.query("update storage.objects set name=$1 where name=$2 returning name",[`${fa}/${listing}/forged.webp`,photo.object_path])).rows.length,0));
  await as(a,async()=>assert.equal((await db.query('delete from storage.objects where name=$1 returning name',[photo.object_path])).rows.length,0));
});
test('unvalidated direct uploads stay private and only the server role may finalize',async()=>{
  await as(a,async()=>{
    const pendingPhoto=await reserve(listing);
    await db.query("insert into storage.objects(bucket_id,name,metadata) values('listing-photos',$1,$2)",[pendingPhoto.object_path,{mimetype:'image/webp',size:10}]);
    await db.query("select set_config('request.jwt.claim.sub','',true)");await db.exec('set local role anon');
    assert.equal(await scalar('select count(*)::int from storage.objects where name=$1',[pendingPhoto.object_path]),0);
    assert.equal(await scalar('select count(*)::int from public.listing_photos where id=$1',[pendingPhoto.id]),0);
  });
  await denied(a,'select public.finalize_listing_photo($1,100,100,100)',[photo.id]);
  await denied(a,'select public.claim_photo_cleanup($1,false)',[photo.id]);
  await denied(a,"update public.listing_photos set state='ready' where id=$1",[photo.id]);
});
test('restrictive Storage fences withstand a pre-existing broad permissive policy',async()=>{
  await assert.rejects(as(b,async()=>{
    await db.exec('reset role');
    await db.exec("create policy accidental_broad_storage_policy on storage.objects for all to anon,authenticated using(true) with check(true)");
    await db.exec('set local role authenticated');
    assert.equal((await db.query("update storage.objects set name='forged.webp' where name=$1 returning name",[photo.object_path])).rows.length,0);
    await db.query("insert into storage.objects(bucket_id,name) values('listing-photos',$1)",[`${fa}/${listing}/${randomUUID()}.webp`]);
  }),{code:'42501'});
});
test('photo reservation quota includes pending uploads; inactive/sold owner photos stay private',async()=>{
  await as(a,async()=>{
    for(let i=0;i<5;i++) await reserve(listing);
    await assert.rejects(reserve(listing),{code:'22023'});
  });
  for(const status of ['inactive','sold']) await as(a,async()=>{
    await db.query('select public.update_inventory_listing($1,1,$2)',[listing,{status}]);
    assert.equal(await scalar('select count(*)::int from storage.objects where name=$1',[photo.object_path]),1);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[b]);
    assert.equal(await scalar('select count(*)::int from storage.objects where name=$1',[photo.object_path]),0);
    await db.exec('set local role anon');await db.query("select set_config('request.jwt.claim.sub','',true)");
    assert.equal(await scalar('select count(*)::int from storage.objects where name=$1',[photo.object_path]),0);
  });
});
test('photo removal, cover/order checks and compensation never delete unrelated or ready assets',async()=>{
  await as(a,async()=>{
    await db.query('select public.arrange_listing_photos($1,$2,$3)',[listing,[photo.id],photo.id]);
    const pendingPhoto=await reserve(listing);
    await db.query("insert into storage.objects(bucket_id,name) values('listing-photos',$1)",[pendingPhoto.object_path]);
    await db.query('select public.remove_listing_photo($1)',[pendingPhoto.id]);
    await db.query('delete from storage.objects where name=$1',[pendingPhoto.object_path]);
    await db.exec('set local role service_role');
    await db.query('select public.finish_photo_cleanup($1)',[pendingPhoto.id]);
    assert.equal(await scalar('select public.claim_photo_cleanup($1,false)',[photo.id]),null);
    assert.equal(await scalar('select count(*)::int from public.listing_photos where id=$1',[photo.id]),1);
  });
  await assert.rejects(as(a,()=>db.query('select public.arrange_listing_photos($1,$2,$3)',[listing,[randomUUID()],photo.id])),{code:'22023'});
});
test('pending/suspended/revoked photo managers fail while editor of the owning facility succeeds',async()=>{
  await as(editor,async()=>assert.ok((await reserve(listing)).id));
  await denied(pending,'select public.reserve_listing_photo($1)',[listing]);
  for(const mode of ['pending','suspended','revoked']) await as(a,async()=>{
    await db.exec('reset role');
    if(mode!=='revoked') await db.query("update public.facilities set status=$1 where id=$2",[mode,fa]);
    else await db.query("update public.facility_memberships set status='revoked' where facility_id=$1 and user_id=$2",[fa,a]);
    await db.exec('set local role authenticated');
    await assert.rejects(reserve(listing),{code:'42501'});
  });
});
test('photo finalization rechecks live uploader approval and stale cleanup claims only unfinished paths',async()=>{
  await as(a,async()=>{
    const pendingPhoto=await reserve(listing);
    await db.query("insert into storage.objects(bucket_id,name,metadata) values('listing-photos',$1,$2)",[pendingPhoto.object_path,{mimetype:'image/webp',size:10}]);
    await db.exec('set local role service_role');
    assert.equal(await scalar('select public.claim_photo_cleanup($1,true)',[pendingPhoto.id]),null);
    assert.equal(await scalar('select public.claim_photo_cleanup($1,false)',[pendingPhoto.id]),pendingPhoto.object_path);
    await db.query('delete from storage.objects where name=$1',[pendingPhoto.object_path]);
    await db.query('select public.finish_photo_cleanup($1)',[pendingPhoto.id]);
    assert.equal(await scalar('select count(*)::int from public.listing_photos where id=$1',[pendingPhoto.id]),0);
  });
  await assert.rejects(as(a,async()=>{
    const pendingPhoto=await reserve(listing);
    await db.query("insert into storage.objects(bucket_id,name,metadata) values('listing-photos',$1,$2)",[pendingPhoto.object_path,{mimetype:'image/webp',size:10}]);
    await db.exec('reset role');await db.query("update public.facility_memberships set status='revoked' where facility_id=$1 and user_id=$2",[fa,a]);
    await db.exec('set local role service_role');await db.query('select public.finalize_listing_photo($1,10,10,10)',[pendingPhoto.id]);
  }),{code:'42501'});
});
test('multi-photo cover/reorder changes are atomic and removal chooses a remaining cover',async()=>{
  await as(a,async()=>{
    const second=await reserve(listing);
    await db.query("insert into storage.objects(bucket_id,name,metadata) values('listing-photos',$1,$2)",[second.object_path,{mimetype:'image/webp',size:10}]);
    await db.exec('set local role service_role');await db.query('select public.finalize_listing_photo($1,10,10,10)',[second.id]);await db.exec('set local role authenticated');
    await db.query('select public.arrange_listing_photos($1,$2,$3)',[listing,[second.id,photo.id],second.id]);
    assert.equal(await scalar('select position from public.listing_photos where id=$1',[second.id]),0);
    assert.equal(await scalar('select is_cover from public.listing_photos where id=$1',[second.id]),true);
    assert.equal(await scalar('select is_cover from public.listing_photos where id=$1',[photo.id]),false);
    await db.query('select public.remove_listing_photo($1)',[second.id]);
    assert.equal(await scalar('select is_cover from public.listing_photos where id=$1',[photo.id]),true);
  });
});
test('three-facility conversation isolation excludes anonymous, viewers and platform admins',async()=>{
  for(const user of [a,b,facilityAdmin,editor]) await as(user,async()=>assert.equal(await scalar('select public.conversation_access($1)',[conversation]),true));
  for(const user of [c,viewer,platform,pending]) {
    await as(user,async()=>{
      assert.equal(await scalar('select count(*)::int from public.conversation_messages where conversation_id=$1',[conversation]),0);
      assert.equal(await scalar('select count(*)::int from public.conversations where id=$1',[conversation]),0);
    });
    await denied(user,'select public.conversation_page($1)',[conversation]);
    await denied(user,'select public.reply_to_conversation($1,$2,$3,$4)',[conversation,fb,'Forged participant',randomUUID()]);
  }
  await denied(null,'select * from public.conversation_messages',[],'anon');
  await as(c,async()=>assert.equal(await scalar('select public.conversation_access($1)',[otherConversation]),true));
});
test('inquiry participants are derived from inventory; own, unavailable, and forged buyers fail',async()=>{
  await assert.rejects(as(a,()=>contact(listing,fa)),{code:'22023'});
  await denied(c,'select public.contact_listing_seller($1,$2,$3,$4)',[listing,fb,'Attack',randomUUID()]);
  await denied(viewer,'select public.contact_listing_seller($1,$2,$3,$4)',[listing,fb,'Attack',randomUUID()]);
  await denied(pending,'select public.contact_listing_seller($1,$2,$3,$4)',[listing,fp,'Attack',randomUUID()]);
  for(const status of ['inactive','sold']) await assert.rejects(as(b,async()=>{
    await db.exec('reset role');await db.query('update public.listings set status=$1 where id=$2',[status,listing]);await db.exec('set local role authenticated');
    await contact(listing,fb);
  }),{code:'22023'});
});
test('existing inactive/sold conversations retain only the safe listing-status projection',async()=>{
  for(const status of ['inactive','sold']) await as(b,async()=>{
    await db.exec('reset role');await db.query('update public.listings set status=$1 where id=$2',[status,listing]);await db.exec('set local role authenticated');
    const page=await scalar('select public.conversation_page($1)',[conversation]);assert.equal(page.conversation.listing_status,status);
    assert.equal('price_usd' in page.conversation,false);assert.equal('notes' in page.conversation,false);
    await reply(conversation,fb,'Follow-up after sale');
  });
});
test('live suspension/revocation and unconfirmed accounts immediately lose message access',async()=>{
  for(const mode of ['suspended','revoked','unconfirmed']) await as(b,async()=>{
    await db.exec('reset role');
    if(mode==='suspended') await db.query("update public.facilities set status='suspended' where id=$1",[fb]);
    if(mode==='revoked') await db.query("update public.facility_memberships set status='revoked' where user_id=$1",[b]);
    if(mode==='unconfirmed') await db.query('update auth.users set email_confirmed_at=null where id=$1',[b]);
    await db.exec('set local role authenticated');
    assert.equal(await scalar('select count(*)::int from public.conversations where id=$1',[conversation]),0);
    await assert.rejects(reply(conversation,fb),{code:'42501'});
  });
});
test('message authors, participants and read receipts cannot be forged through direct API writes',async()=>{
  for(const sql of ["update public.conversations set buyer_facility_id=$1 where id=$2","update public.conversation_messages set author_facility_id=$1 where conversation_id=$2"]) await denied(b,sql,[fc,conversation]);
  await denied(b,'insert into public.conversation_reads(conversation_id,user_id,last_sequence) values($1,$2,99)',[conversation,a]);
  await denied(b,'delete from public.conversation_messages where conversation_id=$1',[conversation]);
  await denied(b,"insert into public.conversation_messages(conversation_id,sequence,author_user_id,author_facility_id,author_label,body,request_id) values($1,99,$2,$3,'Forged','Attack',gen_random_uuid())",[conversation,a,fa]);
});
test('transactional first message, duplicate protection and personal unread cursors',async()=>{
  await as(b,async()=>{
    const nonce=randomUUID();const first=await contact(otherListing,fb,'First message',nonce);
    assert.equal(await contact(otherListing,fb,'First message',nonce),first);
    assert.equal(await scalar('select count(*)::int from public.conversation_messages where conversation_id=$1',[first]),1);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[c]);
    assert.equal((await scalar('select public.facility_inbox($1)',[fc])).unread,1);
    await db.query('select public.mark_conversation_read($1,1)',[first]);
    assert.equal((await scalar('select public.facility_inbox($1)',[fc])).unread,0);
    const request=randomUUID();const msg=await reply(first,fc,'Reply',request);assert.equal(await reply(first,fc,'Reply',request),msg);
  });
  const beforeCount=await scalar('select count(*)::int from public.conversations');
  await assert.rejects(as(b,()=>contact(otherListing,fb,' '.repeat(3))),{code:'22023'});
  assert.equal(await scalar('select count(*)::int from public.conversations'),beforeCount);
});
test('duplicate inquiry survives a sold listing without sending again; changed payloads and future receipts are rejected',async()=>{
  await as(b,async()=>{
    const nonce=randomUUID();const id=await contact(otherListing,fb,'Retry-safe inquiry',nonce);
    await db.exec('reset role');await db.query("update public.listings set status='sold' where id=$1",[otherListing]);await db.exec('set local role authenticated');
    assert.equal(await contact(otherListing,fb,'Retry-safe inquiry',nonce),id);
    assert.equal(await scalar('select count(*)::int from public.conversation_messages where conversation_id=$1',[id]),1);
  });
  await assert.rejects(as(b,async()=>{
    const nonce=randomUUID();await reply(conversation,fb,'Original',nonce);await reply(conversation,fb,'Changed',nonce);
  }),{code:'22023'});
  await assert.rejects(as(b,()=>db.query('select public.mark_conversation_read($1,999999)',[conversation])),{code:'22023'});
});
test('database length and rate limits apply to direct sends; repeated successful requests do not count again',async()=>{
  await assert.rejects(as(b,()=>reply(conversation,fb,'x'.repeat(4001))),{code:'22023'});
  await as(b,async()=>{
    const nonce=randomUUID();const first=await reply(conversation,fb,'Rate test',nonce);
    for(let i=0;i<18;i++) await reply(conversation,fb,`Message ${i}`);
    assert.equal(await reply(conversation,fb,'Rate test',nonce),first);
    await assert.rejects(reply(conversation,fb,'Beyond limit'),{code:'22023'});
  });
});
test('message history is bounded and ordered; cursor pagination and receipt privacy hold',async()=>{
  await as(a,async()=>{
    await db.exec('reset role');
    for(let i=2;i<=35;i++) await db.query("insert into public.conversation_messages(conversation_id,sequence,author_user_id,author_facility_id,author_label,body,request_id) values($1,$2,$3,$4,'Test','History',gen_random_uuid())",[conversation,i,a,fa]);
    await db.query('update public.conversations set last_sequence=35 where id=$1',[conversation]);await db.exec('set local role authenticated');
    const newest=await scalar('select public.conversation_page($1)',[conversation]);assert.equal(newest.messages.length,30);assert.equal(newest.messages[0].sequence,6);assert.equal(newest.has_older,true);
    const older=await scalar('select public.conversation_page($1,6)',[conversation]);assert.equal(older.messages.length,5);assert.equal(older.messages[0].sequence,1);
    assert.equal(await scalar('select count(*)::int from public.conversation_reads where user_id=$1',[b]),0);
  });
});
test('hourly sender and facility-wide rate limits cannot be bypassed by switching conversations',async()=>{
  for(const mode of ['user_hour','facility_minute','facility_hour']) await assert.rejects(as(b,async()=>{
    await db.exec('reset role');
    const count=mode==='user_hour' ? 199 : mode==='facility_minute' ? 99 : 999;
    const actor=mode==='user_hour' ? b : facilityAdmin;
    await db.query(`insert into public.conversation_messages(conversation_id,sequence,author_user_id,author_facility_id,author_label,body,request_id,created_at)
      select $1,n+1,$2,$3,'Limit fixture','Rate fixture',gen_random_uuid(),clock_timestamp()-$4::interval from generate_series(1,$5::integer) n`,
      [conversation,actor,fb,mode==='facility_minute' ? '0 seconds' : '5 minutes',count]);
    await db.query('update public.conversations set last_sequence=$1 where id=$2',[count+1,conversation]);await db.exec('set local role authenticated');
    await reply(conversation,fb,'Beyond window limit');
  }),{code:'22023'});
});


test('message facility summaries isolate facilities, aggregate personal unread and exclude ineligible callers',async()=>{
  await denied(null,'select public.my_message_facilities()',[],'anon');
  for(const user of [pending,viewer,platform]) await as(user,async()=>assert.deepEqual(await scalar('select public.my_message_facilities()'),[]));
  await as(a,async()=>{
    const rows=await scalar('select public.my_message_facilities()');
    assert.equal(rows.length,1);assert.equal(rows[0].id,fa);assert.equal(Number(rows[0].unread),2);
  });
  await as(b,async()=>{
    const rows=await scalar('select public.my_message_facilities()');
    assert.equal(rows.length,1);assert.equal(rows[0].id,fb);assert.equal(Number(rows[0].unread),0);
  });
});

test('multiple approved memberships can switch inboxes; no unrelated, viewer or pending selection',async()=>{
  await as(facilityAdmin,async()=>{
    await db.exec('reset role');
    await db.query("insert into public.facility_memberships(facility_id,user_id,role) values($1,$2,'inventory_editor')",[fc,facilityAdmin]);
    await db.exec('set local role authenticated');
    const rows=await scalar('select public.my_message_facilities()');
    assert.deepEqual(rows.map(f=>f.id).sort(),[fb,fc].sort());
    assert.equal(rows.reduce((n,f)=>n+Number(f.unread),0),2);
    for(const facility of [fb,fc]) {
      await db.query('select public.select_message_facility($1)',[facility]);
      assert.equal(await scalar('select active_facility_id from public.profiles where id=$1',[facilityAdmin]),facility);
      assert.equal((await scalar('select public.facility_inbox($1)',[facility])).items.length,1);
    }
  });
  await denied(b,'select public.select_message_facility($1)',[fa]);
  await denied(viewer,'select public.select_message_facility($1)',[fb]);
  await denied(pending,'select public.select_message_facility($1)',[fp]);
});

test('colleagues share one facility thread but reading does not clear another colleague unread count',async()=>{
  await as(facilityAdmin,async()=>{
    const inbox=await scalar('select public.facility_inbox($1)',[fb]);
    assert.equal(inbox.items[0].id,conversation);
    assert.equal(await contact(listing,fb,'Colleague follows up'),conversation);
    assert.equal(await scalar('select count(*)::int from public.conversations where listing_id=$1 and buyer_facility_id=$2',[listing,fb]),1);
  });
  await as(a,async()=>{
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[a]);
    await reply(conversation,fa,'Seller response');
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[b]);await db.exec('set local role authenticated');
    await db.query('select public.mark_conversation_read($1,2)',[conversation]);
    assert.equal(Number((await scalar('select public.my_message_facilities()'))[0].unread),0);
    await db.query("select set_config('request.jwt.claim.sub',$1,true)",[facilityAdmin]);
    assert.equal(Number((await scalar('select public.my_message_facilities()'))[0].unread),2);
  });
});

test('notification summaries and messaging selection reevaluate suspended and revoked membership live',async()=>{
  for(const mode of ['suspended','revoked']) {
    await as(b,async()=>{
      await db.exec('reset role');
      if(mode==='suspended') await db.query("update public.facilities set status='suspended' where id=$1",[fb]);
      else await db.query("update public.facility_memberships set status='revoked' where facility_id=$1 and user_id=$2",[fb,b]);
      await db.exec('set local role authenticated');
      assert.deepEqual(await scalar('select public.my_message_facilities()'),[]);
    });
    await assert.rejects(as(b,async()=>{
      await db.exec('reset role');
      if(mode==='suspended') await db.query("update public.facilities set status='suspended' where id=$1",[fb]);
      else await db.query("update public.facility_memberships set status='revoked' where facility_id=$1 and user_id=$2",[fb,b]);
      await db.exec('set local role authenticated');
      await db.query('select public.select_message_facility($1)',[fb]);
    }),{code:'42501'});
  }
  await as(a,async()=>{
    await db.exec('reset role');await db.query("update public.facilities set status='suspended' where id=$1",[fb]);await db.exec('set local role authenticated');
    assert.equal(Number((await scalar('select public.my_message_facilities()'))[0].unread),1);
  });
});
