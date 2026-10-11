import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import ts from 'typescript';
import {installStorageContract} from './helpers/storage.mjs';
const db=new PGlite();const [owner,other,viewer,unconfirmed,admin]=Array.from({length:5},()=>randomUUID());let facility,image;
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
async function as(user,cb,role='authenticated'){await db.exec(`begin;set local role ${role}`);await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user??'']);try{return await cb();}finally{await db.exec('rollback');}}
let source=await readFile(new URL('../src/lib/profile-image.ts',import.meta.url),'utf8');
source=source.replace('"./photos/image"',JSON.stringify(new URL('../src/lib/photos/image.ts',import.meta.url).href));
source=source.replace('"sharp"',JSON.stringify(import.meta.resolve('sharp')));
const {validateAvatar}=await import(`data:text/javascript;base64,${Buffer.from(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText).toString('base64')}`);
before(async()=>{
 await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 await installStorageContract(db);
 for(const f of(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL(`../supabase/migrations/${f}`,import.meta.url),'utf8'));
 for(const user of[owner,other,viewer,unconfirmed,admin])await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,$3)',[user,`${user}@example.test`,user===unconfirmed?null:new Date()]);
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[owner]);facility=await scalar("select public.onboard_facility('Fixture facility','City','WI','hospital',gen_random_uuid())");
 await db.query("insert into public.facility_memberships(facility_id,user_id,role) values($1,$2,'viewer')",[facility,viewer]);
 await db.query('update public.profiles set active_facility_id=$1 where id=$2',[facility,viewer]);
 // Even a forged selected facility cannot confer membership/contact access.
 await db.query('update public.profiles set active_facility_id=$1 where id=any($2::uuid[])',[facility,[other,admin,unconfirmed]]);
 await db.query("insert into private.platform_administrators(user_id,bootstrap_reason) values($1,'Local test administrator fixture')",[admin]);
 await db.query('select public.set_facility_contacts($1,$2)',[facility,{business_name:'Business contact',business_email:'business@example.test',secondary_email:'backup@example.test'}]);
 image=await validateAvatar(await sharp({create:{width:800,height:400,channels:3,background:'#188899'}}).png().toBuffer());
 await db.query('select public.update_my_profile($1,true,$2)',['Original Name',image]);
});
after(()=>db.close());
test('headshots are decoded, square WebP and metadata-free; SVG/fake/damaged/oversized images fail',async()=>{
 const bytes=Buffer.from(image.split(',')[1],'base64');const meta=await sharp(bytes).metadata();assert.equal(meta.format,'webp');assert.equal(meta.width,256);assert.equal(meta.height,256);assert.ok(bytes.length<=131072);assert.equal(meta.exif,undefined);
 for(const format of ['jpeg','png','webp'])assert.match(await validateAvatar(await sharp({create:{width:30,height:50,channels:3,background:'#123456'}}).toFormat(format).toBuffer()),/^data:image\/webp;base64,/);
 await assert.rejects(validateAvatar(Buffer.from('<svg></svg>')));await assert.rejects(validateAvatar(Buffer.from('pretend image')));await assert.rejects(validateAvatar(Buffer.from([255,216,255,0])));await assert.rejects(validateAvatar(Buffer.alloc(5*1024*1024+1)));
});
test('profile edits are caller-only, transactional and cannot change membership, ownership or email',async()=>{
 await assert.rejects(as(owner,()=>db.query('update auth.users set email=$1 where id=$2',['forged@example.test',other])),{code:'42501'});
 await assert.rejects(as(owner,()=>db.query("update public.facility_memberships set role='administrator'")),{code:'42501'});
 await assert.rejects(as(owner,()=>db.query('update public.facilities set owner_user_id=$1',[other])),{code:'42501'});
 await as(owner,async()=>{
  await db.query("select public.update_my_profile('Updated Name',false,null)");assert.equal(await scalar('select display_name from public.profiles'),'Updated Name');assert.equal(await scalar('select image_data from public.profile_avatars'),image);
  await assert.rejects(db.query('update public.profiles set active_facility_id=null'),{code:'42501'});
 });
 await as(other,async()=>{assert.equal(await scalar('select count(*)::int from public.profile_avatars'),0);await db.query("select public.update_my_profile('Other Name',true,$1)",[image]);assert.equal(await scalar('select user_id from public.profile_avatars'),other);});
 for(const user of[other,admin])await as(user,async()=>{assert.equal(await scalar('select count(*)::int from public.profile_avatars where user_id=$1',[owner]),0);await assert.rejects(db.query('insert into public.profile_avatars(user_id,image_data) values($1,$2)',[owner,image]),{code:'42501'});});
});
test('anonymous and unconfirmed edits fail; direct avatar writes and unsupported data URLs fail',async()=>{
 await assert.rejects(as(null,()=>db.query("select public.update_my_profile('Name')"),'anon'),{code:'42501'});
 await assert.rejects(as(unconfirmed,()=>db.query("select public.update_my_profile('Name')")),{code:'42501'});
 for(const avatar of['https://example.test/image.png','data:image/svg+xml;base64,PHN2Zz4=',`data:image/webp;base64,${Buffer.alloc(131073).toString('base64')}`])await assert.rejects(as(owner,()=>db.query("select public.update_my_profile('Name',true,$1)",[avatar])),{code:'22023'});
 await assert.rejects(as(owner,()=>db.query('delete from public.profile_avatars')),{code:'42501'});
 await as(owner,async()=>{await db.query("select public.update_my_profile('Name',true,null)");assert.equal(await scalar('select count(*)::int from public.profile_avatars'),0);});
});
test('active facility business contact is internal, excludes backup contact and reevaluates revoked memberships',async()=>{
 for(const user of[owner,viewer])await as(user,async()=>{const contact=await scalar('select public.my_active_facility_business_contact()');assert.equal(contact.email,'business@example.test');assert.equal(Object.keys(contact).length,3);assert.ok(!JSON.stringify(contact).includes('backup'));});
 for(const user of[other,admin,unconfirmed])await as(user,async()=>assert.equal(await scalar('select public.my_active_facility_business_contact()'),null));
 await as(owner,async()=>{await db.query("reset role");await db.query("update public.facility_memberships set status='revoked' where user_id=$1",[owner]);await db.query('set local role authenticated');assert.equal(await scalar('select public.my_active_facility_business_contact()'),null);});
 await assert.rejects(as(null,()=>db.query('select public.my_active_facility_business_contact()'),'anon'),{code:'42501'});
});
