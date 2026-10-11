import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/app-mode";
// Deliberately isolated from ordinary SSR clients; never attach user cookies.
// Needed only to certify decoded images and compensate Storage/DB partial writes.
export function createPhotoAdmin() {
  const {url} = getSupabaseConfig();
  const key = process.env.SUPABASE_SECRET_KEY?.trim();
  if (!key) throw new Error("Photo uploads require the server-only SUPABASE_SECRET_KEY. Configure it locally and restart; do not use a NEXT_PUBLIC variable.");
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}
