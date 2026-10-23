import {deliverEmail} from './email-delivery.mjs';

export function emailConfiguration(env) {
 if(env.H2H_EMAIL_ENABLED!=='true')throw new Error('Email delivery is disabled.');
 const required=['RESEND_API_KEY','H2H_EMAIL_FROM','SUPABASE_EMAIL_SECRET_KEY','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SITE_URL'];
 if(required.some(key=>!env[key]?.trim()))throw new Error('Email configuration is incomplete.');
 const site=new URL(env.NEXT_PUBLIC_SITE_URL),project=new URL(env.NEXT_PUBLIC_SUPABASE_URL);
 if(site.protocol!=='https:'||project.protocol!=='https:'||site.username||site.password||project.username||project.password)throw new Error('Email delivery requires HTTPS site and project URLs.');
 if(/[\r\n]/.test(env.H2H_EMAIL_FROM)||!/@[^\s<>]+\.[^\s<>]+/.test(env.H2H_EMAIL_FROM))throw new Error('Configure a verified sender email.');
 return {url:project.origin,key:env.SUPABASE_EMAIL_SECRET_KEY,delivery:{apiKey:env.RESEND_API_KEY,from:env.H2H_EMAIL_FROM,siteUrl:site.origin}};
}

// Dependencies are injectable: tests never connect to Supabase or send mail.
export async function runEmailBatch(client,config,{send=deliverEmail,pause=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
 const claim=await client.rpc('claim_email_jobs',{p_limit:20});
 if(claim.error||!Array.isArray(claim.data))throw new Error('Could not claim email jobs. Check migrations and worker credentials.');
 const summary={claimed:claim.data.length,accepted:0,retry:0};
 for(const job of claim.data){
  let providerId=null;
  try{providerId=await send(job,config);}catch{ /* No recipients, tokens, or provider errors in logs. */ }
  const finish=await client.rpc('finish_email_job',{p_id:job.id,p_token:job.claim_token,p_provider_id:providerId});
  if(finish.error)throw new Error('An email receipt could not be recorded. Check provider history before retrying; the stable idempotency key is retained.');
  if(providerId)summary.accepted++;else summary.retry++;
  await pause(650);
 }
 return summary;
}
