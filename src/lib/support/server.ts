import "server-only";
import {createClient as createSdkClient} from "@supabase/supabase-js";
import {getSupabaseConfig} from "@/lib/app-mode";
import {createClient} from "@/lib/supabase/server";
import {serviceError} from "@/lib/auth/server";
import type {SupportTicket} from "./types";
export function createSupportAdmin() {
 const key=process.env.SUPABASE_SUPPORT_SECRET_KEY?.trim();
 if(!key) throw new Error("Screenshots are not configured. Submit without a screenshot, or ask the operator to configure the server-only support upload key.");
 return createSdkClient(getSupabaseConfig().url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
export async function supportScreenshotUrl(ticket:SupportTicket) {
 if(ticket.screenshot_state!=='ready' || !ticket.screenshot_path) return null;
 const result=await (await createClient()).storage.from("support-screenshots").createSignedUrl(ticket.screenshot_path,60);
 if(result.error) throw new Error(serviceError(result.error));return result.data.signedUrl;
}
