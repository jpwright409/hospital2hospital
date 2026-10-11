import {createClient} from '@supabase/supabase-js';
// Local configuration inspection by default. --execute is a remote mutation.
const ready=!!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.SUPABASE_SUPPORT_SECRET_KEY;
if(!process.argv.includes('--execute')) console.log(JSON.stringify({mode:'local configuration only; no connections or deletion',configured:ready}));
else {
 if(!ready) throw new Error('Configure the server-only support key and project URL.');
 const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SUPPORT_SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const candidates=await client.rpc('support_cleanup_candidates');if(candidates.error) throw new Error('Support cleanup inspection failed. Check migration 012 and credentials.');
 for(const ticket of candidates.data??[]) {
  const claim=await client.rpc('cleanup_stale_support_screenshot',{p_id:ticket.id,p_finish:false});if(claim.error) throw new Error('Stale support path could not be rechecked.');if(!claim.data)continue;
  const deleted=await client.storage.from('support-screenshots').remove([claim.data]);if(deleted.error) throw new Error('Storage removal failed; pending journal retained.');
  const finish=await client.rpc('cleanup_stale_support_screenshot',{p_id:ticket.id,p_finish:true});if(finish.error) throw new Error('Cleanup not finalized; pending journal retained.');
  console.log(`Cleaned expired pending screenshot for ticket ${ticket.id}`);
 }
}
