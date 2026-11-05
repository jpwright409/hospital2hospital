import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import ts from 'typescript';
const key=Symbol.for('h2h.catalog-actions-test'),data=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
const auth=data(`export async function requirePlatformAdministrator(){const s=globalThis[Symbol.for('h2h.catalog-actions-test')];s.auth++;if(s.deny)throw Error('Admin required');return {supabase:{rpc:async(name,args)=>{s.calls.push([name,args]);return {data:null,error:s.error};}}};}export function serviceError(){return 'Denied by database';}`);
const cache=data(`export function revalidatePath(...args){globalThis[Symbol.for('h2h.catalog-actions-test')].refreshes.push(args);}`);
let source=await readFile(new URL('../src/app/catalog-admin-actions.ts',import.meta.url),'utf8');
for(const[from,to]of[['@/lib/auth/server',auth],['next/cache',cache],['@/lib/auth/policy',new URL('../src/lib/auth/policy.ts',import.meta.url).href]])source=source.replace(JSON.stringify(from),JSON.stringify(to));
const {manageCatalogProduct,moderateMarketplaceListing}=await import(data(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText));
function context(changes={}){return globalThis[key]={auth:0,calls:[],refreshes:[],...changes};}
function form(operation){const f=new FormData();for(const[k,v]of Object.entries({id:randomUUID(),request_id:randomUUID(),revision:'1',operation,reason:'Controlled administrator review reason',confirm:'yes',name:'Product title',manufacturer_id:randomUUID(),catalog_number:'TEST-1',category:'ENT',description:'Description',product_kind:'capital',gtin:'',facility_id:'forged-facility',archived_at:'forged-date',role:'platform_administrator',recipient:'forged@example.test'}))f.set(k,v);return f;}
test('actual catalog/listing Server Actions authenticate before parsing or calling any database mutation',async()=>{
 for(const action of[manageCatalogProduct,moderateMarketplaceListing]){const s=context({deny:true});await assert.rejects(action({},new FormData()),/Admin required/);assert.equal(s.auth,1);assert.equal(s.calls.length,0);}
 for(const action of[manageCatalogProduct,moderateMarketplaceListing]){const s=context();assert.ok((await action({},new FormData())).error);assert.equal(s.calls.length,0);}
});
test('catalog actions send only whitelisted fields, expected revision, immutable request and explicit confirmation',async()=>{
 const s=context(),f=form('update');assert.ok((await manageCatalogProduct({},f)).success);assert.equal(s.calls[0][0],'admin_manage_catalog_product');const args=s.calls[0][1];assert.equal(args.p_id,f.get('id'));assert.equal(args.p_request_id,f.get('request_id'));assert.equal(args.p_revision,1);assert.equal(args.p_confirm,true);assert.deepEqual(Object.keys(args.p_product).sort(),['manufacturer_id','catalog_number','name','category','description','product_kind','gtin'].sort());assert.ok(s.refreshes.some(([path,type])=>path==='/listings/[id]'&&type==='page'));
 const denied=context({error:{code:'22023'}});assert.equal((await manageCatalogProduct({},form('archive'))).error,'Denied by database');assert.equal(denied.refreshes.length,0);
});
test('listing moderation cannot forward a chosen recipient, inventory edit or unsupported decision',async()=>{
 const s=context(),f=form('reject');assert.ok((await moderateMarketplaceListing({},f)).success);assert.equal(s.calls[0][0],'admin_moderate_listing');assert.deepEqual(Object.keys(s.calls[0][1]).sort(),['p_request_id','p_id','p_revision','p_decision','p_reason','p_confirm'].sort());assert.equal(s.calls[0][1].p_decision,'reject');
 const invalid=context();assert.ok((await moderateMarketplaceListing({},form('publish'))).error);assert.equal(invalid.calls.length,0);
 const release=context();assert.match((await moderateMarketplaceListing({},form('release'))).success,/remains unpublished/);assert.equal(release.calls[0][1].p_decision,'release');
});
