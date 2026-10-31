import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {parseBulkUserRequest,bulkUserEligible,MAX_BULK_USERS} from '../src/lib/auth/bulk-users.mjs';
const target=()=>({id:randomUUID(),email:'controlled@example.test',requestId:randomUUID()});
function form(operation='disable',targets=[target()]){const f=new FormData();for(const[k,v]of Object.entries({operation,targets:JSON.stringify(targets),reason:'Administrator reviewed these selected accounts',confirm:'yes',remove_confirmation:'REMOVE'}))f.set(k,v);return f;}
test('bulk input accepts only bounded distinct explicit selections and supported cleanup/reset actions',()=>{
 const targets=Array.from({length:MAX_BULK_USERS},target),f=form('remove',targets);assert.deepEqual(parseBulkUserRequest(f).targets,targets);
 for(const list of[[],Array.from({length:21},target),[targets[0],targets[0]],[targets[0],{...targets[1],requestId:targets[0].requestId}],[{...target(),id:'forged'}]])assert.throws(()=>parseBulkUserRequest(form('disable',list)));
 for(const operation of['enable','invite','email','promote',''])assert.throws(()=>parseBulkUserRequest(form(operation)));
});
test('bulk removal requires typed confirmation and all actions require explicit consent and audit reasons',()=>{
 for(const[key,value]of[['remove_confirmation',''],['confirm','no'],['reason','short'],['targets','not json']]){const f=form('remove');f.set(key,value);assert.throws(()=>parseBulkUserRequest(f));}
 const f=form();f.set('reason','x'.repeat(501));assert.throws(()=>parseBulkUserRequest(f));
});
test('UI eligibility excludes administrators/unresolved actions and distinguishes owner removal from disable/reset',()=>{
 const ordinary={email:'user@example.test',email_confirmed_at:'2026-10-31',disabled:false};
 for(const operation of['remove','disable','reset']){assert.equal(bulkUserEligible(ordinary,operation),true);assert.equal(bulkUserEligible({...ordinary,platform_administrator:true},operation),false);assert.equal(bulkUserEligible({...ordinary,action_pending:true},operation),false);}
 assert.equal(bulkUserEligible({...ordinary,facility_owner:true},'remove'),false);assert.equal(bulkUserEligible({...ordinary,facility_owner:true},'disable'),true);
 assert.equal(bulkUserEligible({...ordinary,email_confirmed_at:null},'reset'),false);assert.equal(bulkUserEligible({...ordinary,email_confirmed_at:null},'remove'),true);assert.equal(bulkUserEligible({...ordinary,disabled:true},'disable'),false);assert.equal(bulkUserEligible({...ordinary,disabled:true},'reset'),false);
});
