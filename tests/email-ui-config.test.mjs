import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {emailConfiguration} from '../scripts/email-runner.mjs';

const source=(await readFile(new URL('../src/lib/email-config.ts',import.meta.url),'utf8')).replace('import "server-only";','');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext}}).outputText;
const {emailDeliveryConfigured}=await import('data:text/javascript;base64,'+Buffer.from(compiled).toString('base64'));
test('website email opt-in needs only the explicit queue-enable flag, not worker credentials',()=>{
 assert.equal(emailDeliveryConfigured({H2H_EMAIL_ENABLED:'true'}),true);
 assert.equal(emailDeliveryConfigured({H2H_EMAIL_ENABLED:' true '}),true);
 for(const flag of[undefined,'','false','0','TRUE'])assert.equal(emailDeliveryConfigured({H2H_EMAIL_ENABLED:flag}),false);
 assert.equal(emailDeliveryConfigured({RESEND_API_KEY:'fictional',H2H_EMAIL_FROM:'info@example.test',SUPABASE_EMAIL_SECRET_KEY:'fictional'}),false);
});
test('the separate worker still refuses sending without complete provider/service configuration',()=>{
 assert.throws(()=>emailConfiguration({H2H_EMAIL_ENABLED:'true'}),/incomplete/);
 assert.throws(()=>emailConfiguration({H2H_EMAIL_ENABLED:'false'}),/disabled/);
});
