import "server-only";
import {createClient} from "@supabase/supabase-js";
import {getSupabaseConfig} from "@/lib/app-mode";

// Never attach the caller's cookies/session to this privileged client.
// Only the guarded user-management server action may use it.
export function createUserAdmin(){
 const {url}=getSupabaseConfig();const key=process.env.SUPABASE_SECRET_KEY?.trim();
 if(!key)throw new Error("User management needs the server-only SUPABASE_SECRET_KEY. Configure it on the server and retry.");
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,flowType:"implicit"}});
}
