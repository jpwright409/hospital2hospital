// Plain text only. This module can be tested with a mocked transport.
export function emailPayload(job, { from, siteUrl }) {
 const origin=new URL(siteUrl);if(!['http:','https:'].includes(origin.protocol) || origin.username || origin.password) throw new Error('Invalid site URL.');
 const base=origin.origin;
 if(job.kind==='referral') return {from,to:[job.recipient],subject:'An invitation to Hospital2Hospital',
  text:`${job.payload.referrer || 'A colleague'} from ${job.payload.facility} is inviting you to join Hospital2Hospital's no-cost marketplace.\n\nConnect with healthcare facilities that have excess surgical supplies and equipment.\nRegister: ${base}/auth/register\n\nRegistration and facility approval are required. This invitation does not grant facility membership. If you are not interested, no action is required. We will not add you to a mailing list.`};
 if(job.kind!=='watchlist') throw new Error('Unsupported email type.');
 return {from,to:[job.recipient],subject:'New inventory matches your Hospital2Hospital watchlist',
  text:`New inventory matched your watchlist "${job.payload.watchlist}":\n${job.payload.product}\nCatalog # ${job.payload.catalog}\n\nView current availability: ${base}/listings/${job.listing_id}\n\nA match is not a reservation. Availability may change.\nTurn off email alerts, pause or remove this watchlist: ${base}/watchlist`};
}
export async function deliverEmail(job,config,transport=fetch) {
 const response=await transport('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(20000),
  headers:{Authorization:`Bearer ${config.apiKey}`,'Content-Type':'application/json','Idempotency-Key':`h2h-email/${job.id}`},
  body:JSON.stringify(emailPayload(job,config))});
 if(!response.ok) throw new Error('Email provider rejected the request. Review provider status and sender setup.');
 const result=await response.json();if(typeof result.id!=='string' || !result.id) throw new Error('Email provider returned an invalid receipt.');return result.id;
}
