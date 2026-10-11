import {createClient} from '@supabase/supabase-js';
import {deliverEmail} from './email-delivery.mjs';
// Default is local configuration inspection ONLY; --execute connects and sends.
const execute=process.argv.includes('--execute');
const ready=process.env.H2H_EMAIL_ENABLED==='true' && !!process.env.RESEND_API_KEY && !!process.env.H2H_EMAIL_FROM && !!process.env.SUPABASE_EMAIL_SECRET_KEY && !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SITE_URL;
if(!execute) {console.log(JSON.stringify({mode:'local configuration check; no service connections or email sends',configured:ready}));}
else {
 if(!ready) throw new Error('Email delivery disabled or incomplete. Configure server-only email credentials, sender and site URL before execution.');
 const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_EMAIL_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const config={apiKey:process.env.RESEND_API_KEY,from:process.env.H2H_EMAIL_FROM,siteUrl:process.env.NEXT_PUBLIC_SITE_URL};
 const claim=await client.rpc('claim_email_jobs',{p_limit:20});if(claim.error) throw new Error('Could not claim email jobs. Check migration 011 and worker credentials.');
 for(const job of claim.data??[]) {
  let providerId=null;
  try {providerId=await deliverEmail(job,config);}catch {console.error(`Email job ${job.id} was not confirmed; retained for bounded retry.`);}
  const finish=await client.rpc('finish_email_job',{p_id:job.id,p_token:job.claim_token,p_provider_id:providerId});
  if(finish.error) throw new Error('Email receipt could not be recorded. A later worker may retry using the same provider idempotency key.');
  console.log(`Email job ${job.id}: ${providerId ? 'accepted by provider (not proof of inbox delivery)' : 'pending retry'}`);
  await new Promise(resolve=>setTimeout(resolve,650));
 }
}
