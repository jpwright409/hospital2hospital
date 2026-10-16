import {readFile} from 'node:fs/promises';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
const key=Symbol.for('h2h.facilitator-access.test');
const auth=`export async function authenticatedClient(){const s=globalThis[Symbol.for('h2h.facilitator-access.test')];if(s.authError)throw Error('mock auth unavailable');return {user:s.user,supabase:{rpc:async(name)=>{s.calls.push(name);return {data:s.admin,error:s.rpcError};}}};}export function serviceError(){return 'Account service unavailable.';}`;
const mode=`export function getAppMode(){return globalThis[Symbol.for('h2h.facilitator-access.test')].mode;}`;
const moduleUrl=s=>`data:text/javascript;base64,${Buffer.from(s).toString('base64')}`;
let source=await readFile(new URL('../src/app/api/facilitator-access/route.ts',import.meta.url),'utf8');
source=source.replace('"@/lib/auth/server"',JSON.stringify(moduleUrl(auth))).replace('"@/lib/app-mode"',JSON.stringify(moduleUrl(mode)));
const {GET}=await import(moduleUrl(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText));
function setup(overrides={}){const state={mode:'connected',user:null,admin:false,rpcError:null,authError:false,calls:[],...overrides};globalThis[key]=state;return state;}
const verified={id:'test-user',email_confirmed_at:'2026-10-15T00:00:00Z'};
test('facilitator visibility denies anonymous and unconfirmed accounts without querying privilege',async()=>{
 for(const user of [null,{id:'unconfirmed',user_metadata:{role:'admin',is_platform_administrator:true}}]){const s=setup({user,admin:true});const r=await GET();assert.deepEqual(await r.json(),{isPlatformAdministrator:false});assert.equal(r.headers.get('Cache-Control'),'private, no-store');assert.equal(r.headers.get('Vary'),'Cookie');assert.deepEqual(s.calls,[]);}
});
test('facility roles and user metadata do not grant facilitator visibility; live platform role does',async()=>{
 for(const role of ['owner','administrator','inventory_editor','viewer']){const s=setup({user:{...verified,user_metadata:{role,is_platform_administrator:true}},admin:false});assert.deepEqual(await(await GET()).json(),{isPlatformAdministrator:false});assert.deepEqual(s.calls,['is_platform_administrator']);}
 const s=setup({user:verified,admin:true});assert.deepEqual(await(await GET()).json(),{isPlatformAdministrator:true});assert.deepEqual(s.calls,['is_platform_administrator']);
 s.admin=false;assert.deepEqual(await(await GET()).json(),{isPlatformAdministrator:false});
});
test('permission-service failures hide facilitator links with uncached actionable errors',async()=>{
 for(const errors of [{authError:true},{rpcError:{code:'unavailable'}},{admin:null}]){setup({user:verified,admin:true,...errors});const r=await GET();const data=await r.json();assert.equal(data.isPlatformAdministrator,false);if(errors.authError||errors.rpcError){assert.equal(r.status,503);assert.equal(data.error,'Account service unavailable.');}assert.equal(r.headers.get('Cache-Control'),'private, no-store');}
});
test('demo mode has no facilitator link and makes no Auth or privilege request',async()=>{
 const s=setup({mode:'demo',admin:true,authError:true});const r=await GET();assert.equal(r.status,200);assert.deepEqual(await r.json(),{isPlatformAdministrator:false});assert.deepEqual(s.calls,[]);
});
