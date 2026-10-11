import {createClient} from "@supabase/supabase-js";
// Operator-triggered only. This script is never run by builds/tests or the app.
// --execute is explicit; the default only reports a bounded candidate batch.
const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.SUPABASE_SECRET_KEY;
if(!url || !key) throw new Error("Set the project URL and server-only secret key. No credentials are printed.");
const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
const cutoff=new Date(Date.now()-3600000).toISOString();
const {data,error}=await client.from("listing_photos").select("id,object_path,state,created_at").or(`state.eq.deleting,and(state.eq.pending,created_at.lt.${cutoff})`).order("created_at").limit(100);
if(error) throw new Error("Could not inspect the photo cleanup journal. Check credentials and migrations.");
console.log(JSON.stringify({mode:process.argv.includes("--execute") ? "execute exact claimed paths" : "dry run; no writes",candidates:data},null,2));
if(process.argv.includes("--execute")) for(const photo of data ?? []) {
  const claim=await client.rpc("claim_photo_cleanup",{p_photo_id:photo.id,p_stale_only:true});
  if(claim.error) throw claim.error;if(!claim.data) continue;
  const remove=await client.storage.from("listing-photos").remove([claim.data]);
  if(remove.error) throw remove.error;
  const finish=await client.rpc("finish_photo_cleanup",{p_photo_id:photo.id});
  if(finish.error) throw finish.error;
  console.log(`Cleaned photo reservation ${photo.id}`);
}
