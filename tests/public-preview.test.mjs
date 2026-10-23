import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {publicListingPreview} from '../src/lib/inventory/public-preview.mjs';

const listing={id:'public-listing',name:'Public supply',manufacturer:'Reference brand',catalog_number:'CAT-1',price_usd:12,quantity_unit:'box',price_negotiable:false,status:'active',deleted_at:null,facility:{name:'Approved public facility',city:'Austin',state:'TX',owner_user_id:'must-not-be-exposed'},notes:'not-in-preview',created_by:'private-account-id'};
function client({items=[listing],queryError=null,photoError=null,signError=null}={}){
 const calls=[];const query={select:(...args)=>{calls.push(['select',...args]);return query;},in:(...args)=>{calls.push(['in',...args]);return query;},eq:(...args)=>{calls.push(['eq',...args]);return query;},order:(...args)=>{calls.push(['order',...args]);return query;},then:resolve=>resolve({data:[{listing_id:listing.id,object_path:'internal-cover.webp',is_cover:true},{listing_id:listing.id,object_path:'internal-secondary.webp',is_cover:false}],error:photoError})};
 return {calls,rpc:async(name,args)=>{calls.push(['rpc',name,args]);return {data:{items},error:queryError};},from:table=>{calls.push(['from',table]);return query;},storage:{from:bucket=>({createSignedUrls:async(paths,expiry)=>{calls.push(['sign',bucket,paths,expiry]);return {data:paths.map(path=>({path,signedUrl:'https://photos.example.test/signed-cover'})),error:signError};}})}};
}

test('public preview uses a fixed active/public query, bounded size and narrow safe projection',async()=>{
 const mock=client();const items=await publicListingPreview(mock);
 assert.deepEqual(mock.calls[0],['rpc','search_inventory_v2',{p_query:'',p_sort:'newest',p_page:1,p_page_size:12,p_facility_id:null,p_saved:false,p_status:'active'}]);
 assert.deepEqual(items,[{id:'public-listing',name:'Public supply',manufacturer:'Reference brand',catalogNumber:'CAT-1',priceUsd:12,quantityUnit:'box',negotiable:false,facilityName:'Approved public facility',location:'Austin, TX',photoUrl:'https://photos.example.test/signed-cover'}]);
 assert.deepEqual(mock.calls.find(c=>c[0]==='sign'),['sign','listing-photos',['internal-cover.webp'],60]);
 assert.ok(!JSON.stringify(items).includes('internal-cover.webp'));assert.ok(!JSON.stringify(items).includes('must-not-be-exposed'));
 assert.equal((await publicListingPreview(client({items:Array(15).fill(listing)}))).length,12);
});

test('empty inventory is empty, and service, visibility or Storage failures never return fictional or private stock',async()=>{
 const empty=client({items:[]});assert.deepEqual(await publicListingPreview(empty),[]);assert.equal(empty.calls.length,1);
 for(const options of[{queryError:{code:'503'}},{items:[{...listing,status:'draft'}]},{items:[{...listing,deleted_at:'2026-10-23'}]},{photoError:{code:'42501'}},{signError:{code:'403'}}])await assert.rejects(publicListingPreview(client(options)));
});

const key=Symbol.for('h2h.public-preview-test');
const moduleUrl=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const configMock=moduleUrl(`export function getAppMode(){return globalThis[Symbol.for('h2h.public-preview-test')].mode;}export function getSupabaseConfig(){return {url:'https://project.example.test',key:'publishable-only'};}`);
const clientMock=moduleUrl(`export function createClient(...args){const s=globalThis[Symbol.for('h2h.public-preview-test')];s.created.push(args);return {};}`);
const loaderMock=moduleUrl(`export async function publicListingPreview(){const s=globalThis[Symbol.for('h2h.public-preview-test')];if(s.fail)throw Error('private provider failure');return [{id:'public'}];}`);
let source=await readFile(new URL('../src/app/api/public-listing-preview/route.ts',import.meta.url),'utf8');
for(const [from,to]of [['@supabase/supabase-js',clientMock],['@/lib/app-mode',configMock],['@/lib/inventory/public-preview.mjs',loaderMock]])source=source.replace(JSON.stringify(from),JSON.stringify(to));
const {GET}=await import(moduleUrl(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText));
test('preview endpoint uses only a session-free publishable client and private/no-store responses',async()=>{
 const context={mode:'connected',created:[]};globalThis[key]=context;const response=await GET();assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
 assert.equal(context.created[0][1],'publishable-only');assert.deepEqual(context.created[0][2].auth,{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false});assert.equal(GET.length,0);
 context.fail=true;const failed=await GET();assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('private provider failure'));
 context.mode='demo';context.created=[];assert.equal((await GET()).status,404);assert.equal(context.created.length,0);
});
