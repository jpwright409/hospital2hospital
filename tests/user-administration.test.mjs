import {PGlite} from '@electric-sql/pglite';
import {readFile,readdir} from 'node:fs/promises';
import {test,before,after} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {installStorageContract} from './helpers/storage.mjs';import {seedApprovedProducts} from './helpers/catalog-fixtures.mjs';
import {performUserAdminOperation} from '../src/lib/auth/user-admin-operation.mjs';
const db=new PGlite();const [admin,conner,owner,other,unconfirmed]=Array.from({length:5},()=>randomUUID());let facility,listing;
const reason='Owner-authorized account administration test';
const scalar=async(sql,args=[])=>Object.values((await db.query(sql,args)).rows[0])[0];
async function who(user){await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user??'']);}
async function as(user,cb,role='authenticated'){await db.exec(`begin;set local role ${role}`);await who(user);try{return await cb();}finally{await db.exec('rollback');}}
async function service(cb){const previous=await scalar("select current_setting('request.jwt.claim.sub',true)");await db.exec('begin;set local role service_role');await who(null);try{const result=await cb();await db.exec('commit');return result;}catch(e){await db.exec('rollback');throw e;}finally{await db.query("select set_config('request.jwt.claim.sub',$1,false)",[previous??'']);}}
const denied=(user,sql,args=[],role)=>assert.rejects(as(user,()=>db.query(sql,args),role),{code:'42501'});
const begin=(action,target=owner,email='',expected='owner@example.test',id=randomUUID(),name='',note=reason)=>scalar('select public.begin_account_admin_action($1,$2,$3,$4,$5,$6,$7)',[id,action,target,email,name,expected,note]);
const finish=(id,token,success,created=null)=>scalar('select public.finish_account_admin_action($1,$2,$3,$4)',[id,token,success,created]);
before(async()=>{
 await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,banned_until timestamptz,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);await installStorageContract(db);
 for(const f of(await readdir(new URL('../supabase/migrations/',import.meta.url))).filter(f=>f.endsWith('.sql')).sort())await db.exec(await readFile(new URL('../supabase/migrations/'+f,import.meta.url),'utf8'));
 for(const [id,email,confirmed]of[[admin,'admin@example.test',true],[conner,'conner@babursolutions.com',true],[owner,'owner@example.test',true],[other,'other@example.test',true],[unconfirmed,'pending@example.test',false]])await db.query("insert into auth.users(id,email,email_confirmed_at) values($1,$2,case when $3 then now() else null end)",[id,email,confirmed]);
 await db.query("insert into private.platform_administrators(user_id,bootstrap_reason) values($1,'Local admin fixture')",[admin]);
 await db.exec(await readFile(new URL('../supabase/operator/grant-conner-admin.sql',import.meta.url),'utf8'));
 await db.query("insert into private.platform_administrators(user_id,bootstrap_reason) values($1,'Unconfirmed administrator fixture')",[unconfirmed]);
 await who(owner);facility=await scalar("select public.onboard_facility('Test facility','Dallas','TX','hospital',gen_random_uuid())");await db.query("update public.facilities set status='approved' where id=$1",[facility]);
 await seedApprovedProducts(db,[{manufacturer:'Trusted test reference',catalog_number:'USERS-1',name:'Test supply',category:'General Surgery'}]);const pid=await scalar("select id from public.products where catalog_number='USERS-1'");
 listing=await scalar('select public.create_inventory_listing($1,$2,$3)',[facility,{id:pid},{quantity:1,quantity_unit:'each',units_per_package:1,price_usd:10,condition:'New / unopened',status:'active',sterile:false,single_use:true,packaging:'',notes:''}]);
 await who(null);
});after(()=>db.close());
test('operator grant targets Conner only and is idempotent without confirming or joining facilities',async()=>{
 await who(null);await db.exec(await readFile(new URL('../supabase/operator/grant-conner-admin.sql',import.meta.url),'utf8'));assert.equal(await scalar('select count(*) from private.platform_administrators where user_id=$1',[conner]),1);assert.equal(await scalar('select count(*) from public.facility_memberships where user_id=$1',[conner]),0);
});
test('directory and audit deny anonymous, facility owners, unrelated and unconfirmed administrators',async()=>{
 for(const user of[owner,other,unconfirmed]){await denied(user,'select public.admin_user_directory()');await denied(user,'select public.admin_account_audit()');await denied(user,'select public.begin_account_admin_action($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),'disable',owner,'','','owner@example.test',reason]);}
 await denied(null,'select public.admin_user_directory()',[],'anon');
 await as(admin,async()=>{const data=await scalar('select public.admin_user_directory($1,1)',['conner@']);assert.equal(data.total,1);assert.equal(data.items[0].platform_administrator,true);assert.deepEqual(Object.keys(data.items[0]).sort(),['disabled','display_name','email','email_confirmed_at','id','platform_administrator']);});
});
test('self and other platform administrators cannot be disabled, enabled or have login emails changed',async()=>{
 for(const target of[admin,conner])for(const action of['disable','enable','email'])await denied(admin,'select public.begin_account_admin_action($1,$2,$3,$4,$5,$6,$7)',[randomUUID(),action,target,'new@example.test','',target===admin?'admin@example.test':'conner@babursolutions.com',reason]);
 await denied(owner,'insert into private.platform_administrators(user_id,bootstrap_reason) values($1,$2)',[owner,reason]);
});
test('disable gates an existing JWT immediately at table, RPC and Storage boundaries',async()=>{
 await who(admin);const photoId=randomUUID(),path=facility+'/'+listing+'/'+photoId+'.webp';
 await db.query("insert into public.listing_photos(id,listing_id,object_path,created_by,state,width,height,size_bytes) values($1,$2,$3,$4,'ready',100,100,100)",[photoId,listing,path,owner]);await db.query("insert into storage.objects(bucket_id,name) values('listing-photos',$1)",[path]);
 await as(owner,async()=>assert.equal((await db.query('select name from storage.objects where name=$1',[path])).rows.length,1));
 const id=randomUUID(),job=await begin('disable',owner,'','owner@example.test',id);assert.equal(job.execute,true);
 await as(owner,async()=>{assert.equal(await scalar('select public.account_access_enabled()'),false);assert.equal((await db.query('select * from public.profiles')).rows.length,0);});
 await as(owner,async()=>{try{const rows=await db.query('select name from storage.objects where name=$1',[path]);assert.equal(rows.rows.length,0);}catch(e){assert.equal(e.code,'42501');}});
 await denied(owner,'select public.set_active_facility($1)',[facility]);await denied(owner,'select public.update_inventory_listing($1,1,$2)',[listing,{status:'sold'}]);await denied(owner,'select public.admin_user_directory()');
 await denied(admin,'select public.finish_account_admin_action($1,$2,true,null)',[id,job.token]);
 await service(()=>finish(id,job.token,false));assert.equal(await scalar('select disabled from private.account_controls where user_id=$1',[owner]),true);
});
test('enable remains blocked until Auth unban succeeds; live Auth bans also block existing JWTs',async()=>{
 await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[owner]);await who(admin);const id=randomUUID(),job=await begin('enable',owner,'','owner@example.test',id);
 await assert.rejects(service(()=>finish(id,job.token,true)),{code:'22023'});assert.equal(await scalar('select disabled from private.account_controls where user_id=$1',[owner]),true);
 await db.query('update auth.users set banned_until=null where id=$1',[owner]);await service(()=>finish(id,job.token,true));await as(owner,async()=>assert.equal(await scalar('select public.account_access_enabled()'),true));
 await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1",[other]);await as(other,async()=>assert.equal(await scalar('select public.account_access_enabled()'),false));await db.query('update auth.users set banned_until=null where id=$1',[other]);
});
test('operations reject stale emails, missing confirmation/reasons and duplicates do not execute twice',async()=>{
 await assert.rejects(as(admin,()=>begin('email',owner,'new@example.test','wrong@example.test')),{code:'22023'});await assert.rejects(as(admin,()=>begin('disable',owner,'','owner@example.test',randomUUID(),'','short')),{code:'22023'});
 await who(admin);const id=randomUUID(),a=await begin('email',owner,'new@example.test','owner@example.test',id);assert.equal((await begin('email',owner,'new@example.test','owner@example.test',id)).execute,false);await service(()=>finish(id,a.token,true));assert.equal((await begin('email',owner,'new@example.test','owner@example.test',id)).execute,false);
 await denied(conner,'select public.begin_account_admin_action($1,$2,$3,$4,$5,$6,$7)',[id,'email',owner,'new@example.test','','owner@example.test',reason]);
});
test('uncertain outcomes are journaled, prevent replay and do not expose claim tokens',async()=>{
 await who(admin);const id=randomUUID(),a=await begin('email',other,'changed@example.test','other@example.test',id);await service(()=>finish(id,a.token,null));
 await assert.rejects(as(admin,()=>begin('disable',other,'','other@example.test')),{code:'22023'});await as(admin,async()=>{const logs=await scalar('select public.admin_account_audit()');const row=logs.find(r=>r.id===id);assert.equal(row.state,'uncertain');assert.ok(!Object.keys(row).includes('claim_token'));});
});
test('invitations are pending manual accounts, duplicate emails denied, and account-action limits enforced',async()=>{
 await who(admin);await assert.rejects(as(admin,()=>begin('invite',null,'owner@example.test','',randomUUID(),'New user')),{code:'22023'});
 const id=randomUUID(),a=await begin('invite',null,'invite@example.test','',id,'Invited user');assert.equal(a.execute,true);assert.equal(await scalar("select count(*) from auth.users where email='invite@example.test'"),0);
 const newUser=randomUUID();await db.query('insert into auth.users(id,email) values($1,$2)',[newUser,'invite@example.test']);await service(()=>finish(id,a.token,true,newUser));assert.equal((await begin('invite',null,'invite@example.test','',id,'Invited user')).execute,false);assert.equal(await scalar('select count(*) from public.facility_memberships where user_id=$1',[newUser]),0);
 await who(conner);for(let i=0;i<20;i++)await begin('invite',null,`limit-${i}@example.test`,'',randomUUID(),'Invited user');await assert.rejects(as(conner,()=>begin('invite',null,'limit-21@example.test','',randomUUID(),'Invited user')),{code:'22023'});
});
function mockAdmin(user={id:'target',email:'current@example.test',email_confirmed_at:'2026-10-21'}){const calls=[];return {calls,auth:{admin:{getUserById:async id=>{calls.push(['get',id]);return {data:{user}};},updateUserById:async(id,attrs)=>{calls.push(['update',id,attrs]);return {data:{user:{id}}};},inviteUserByEmail:async(email,options)=>{calls.push(['invite',email,options]);return {data:{user:{id:'new',email}}};}},resetPasswordForEmail:async(email,options)=>{calls.push(['reset',email,options]);return {};}}};}
test('Auth operations use immutable target rechecks, narrow attributes and the actual verified reset address',async()=>{
 for(const [action,attrs]of[['disable',{ban_duration:'876000h'}],['enable',{ban_duration:'none'}],['email',{email:'new@example.test'}]]){const mock=mockAdmin();await performUserAdminOperation(mock,{action,targetId:'target',expectedEmail:'current@example.test',email:'new@example.test'},'https://example.test/auth/accept-account');assert.deepEqual(mock.calls,[['get','target'],['update','target',attrs]]);}
 const mock=mockAdmin();await performUserAdminOperation(mock,{action:'reset',targetId:'target',expectedEmail:'current@example.test',email:'forged@example.test'},'https://example.test/auth/accept-account');assert.equal(mock.calls[1][1],'current@example.test');
 const changed=mockAdmin();await assert.rejects(performUserAdminOperation(changed,{action:'email',targetId:'other',expectedEmail:'current@example.test',email:'new@example.test'},''));assert.equal(changed.calls.length,1);
});
test('manual user invitation never sets a password, email confirmation, platform role or facility membership',async()=>{
 const mock=mockAdmin();await performUserAdminOperation(mock,{action:'invite',email:'new@example.test',name:'New user'},'https://example.test/auth/accept-account');assert.deepEqual(mock.calls,[['invite','new@example.test',{data:{display_name:'New user'},redirectTo:'https://example.test/auth/accept-account'}]]);
 await assert.rejects(performUserAdminOperation(mock,{action:'promote'},''));
});

// Exercise the actual Server Action authorization boundary with mock adapters.
const mockKey=Symbol.for('h2h.user-admin-action-test');
const ts=await import('typescript');
const dataModule=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const mockAuth=dataModule(`export async function requirePlatformAdministrator(){const s=globalThis[Symbol.for('h2h.user-admin-action-test')];if(s.deny)throw Error('Administrator required');return {supabase:{rpc:async(name)=>{s.rpcCalls.push(name);return name==='begin_account_admin_action'?s.begin:{data:s.livePermission,error:null};}}};}export function serviceError(){return 'Denied or unavailable';}`);
const mockClient=dataModule(`export function createUserAdmin(){const s=globalThis[Symbol.for('h2h.user-admin-action-test')];s.created++;return s.client;}`);
const mockCache=dataModule('export function revalidatePath(){}');
const mockMode=dataModule('export function getSiteUrl(){return "https://example.test";}');
const mockPolicy=dataModule('export function validUuid(v){return /^[0-9a-f-]{36}$/i.test(v);}');
let actionSource=await readFile(new URL('../src/app/user-admin-actions.ts',import.meta.url),'utf8');
for(const [from,to]of[['next/cache',mockCache],['@/lib/auth/server',mockAuth],['@/lib/supabase/user-admin',mockClient],['@/lib/app-mode',mockMode],['@/lib/auth/policy',mockPolicy],['@/lib/auth/user-admin-operation.mjs',new URL('../src/lib/auth/user-admin-operation.mjs',import.meta.url).href]])actionSource=actionSource.replace(JSON.stringify(from),JSON.stringify(to));
const {manageUser}=await import(dataModule(ts.default.transpileModule(actionSource,{compilerOptions:{module:ts.default.ModuleKind.ESNext,target:ts.default.ScriptTarget.ES2022}}).outputText));
function actionContext(overrides={}){const client=mockAdmin({id:owner,email:'owner@example.test',email_confirmed_at:'2026-10-21'});const finishes=[];client.rpc=async(name,args)=>{finishes.push([name,args]);return {error:null};};const s={deny:false,created:0,client,finishes,rpcCalls:[],livePermission:true,begin:{data:{execute:true,token:randomUUID()},error:null},...overrides};globalThis[mockKey]=s;return s;}
function actionForm(){const f=new FormData();for(const [k,v]of Object.entries({request_id:randomUUID(),operation:'disable',user_id:owner,expected_email:'owner@example.test',reason,confirm:'yes'}))f.set(k,v);return f;}
test('Server Action rejects nonadministrators before creating or using a privileged Auth client',async()=>{
 const s=actionContext({deny:true});await assert.rejects(manageUser({},actionForm()),/Administrator required/);assert.equal(s.created,0);assert.equal(s.client.calls.length,0);assert.equal(s.finishes.length,0);
});
test('Server Action never repeats external work after a duplicate or denied audit reservation',async()=>{
 for(const begin of[{data:{execute:false,state:'succeeded'},error:null},{data:null,error:{code:'42501'}}]){const s=actionContext({begin});await manageUser({},actionForm());assert.equal(s.client.calls.length,0);assert.equal(s.finishes.length,0);}
});
test('Server Action rechecks live administrator permission after reserving an operation',async()=>{
 const s=actionContext({livePermission:false});const result=await manageUser({},actionForm());assert.ok(result.error);assert.equal(s.client.calls.length,0);assert.equal(s.finishes[0][1].p_success,false);
});
