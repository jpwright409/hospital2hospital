import {emailConfiguration,runEmailBatch} from './email-runner.mjs';
// Default is local configuration inspection ONLY; --execute connects and sends.
let config;
try{config=emailConfiguration(process.env);}catch{ /* Report readiness without values. */ }
if(!process.argv.includes('--execute')){
 console.log(JSON.stringify({mode:'local configuration check; no service connections or email sends',configured:!!config}));
}else{
 try{
  if(!config)throw new Error('Email delivery disabled or incomplete. Configure HTTPS URLs, worker credentials and a verified sender.');
  const {createClient}=await import('@supabase/supabase-js');
  const client=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(30000)})}});
  const summary=await runEmailBatch(client,config.delivery);
  console.log(JSON.stringify(summary));
  if(summary.retry)process.exitCode=1;
 }catch{
  console.error('Email worker could not complete. Check configuration, queue receipts, and provider delivery logs. No unconfirmed send is retried with a new identity.');
  process.exitCode=1;
 }
}
