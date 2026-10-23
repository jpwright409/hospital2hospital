import {createClient} from "@supabase/supabase-js";
import {getAppMode,getSupabaseConfig} from "@/lib/app-mode";
import {publicListingPreview} from "@/lib/inventory/public-preview.mjs";

const headers={"Cache-Control":"private, no-store"};
export async function GET(){
 if(getAppMode()!=="connected")return Response.json({error:"Public inventory is not connected."},{status:404,headers});
 try{
  const {url,key}=getSupabaseConfig();
  // Always anonymous, even if a signed-in visitor calls this public endpoint.
  // No cookies, secret key, client filters, persistent sessions or shared cache.
  const client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,options)=>fetch(url,{...options,cache:"no-store",signal:AbortSignal.timeout(10000)})}});
  return Response.json({items:await publicListingPreview(client)},{headers});
 }catch{return Response.json({error:"Listing previews are temporarily unavailable. Please try again."},{status:503,headers});}
}
