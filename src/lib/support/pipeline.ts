import type {SupabaseClient} from "@supabase/supabase-js";
export const SUPPORT_BUCKET="support-screenshots";
export async function uploadSupportScreenshot(client:SupabaseClient,admin:SupabaseClient,ticket:{id:string;screenshot_path:string;screenshot_state:string},userId:string,image:{data:Uint8Array;width:number;height:number;size:number}) {
 if(ticket.screenshot_state==='ready') return;
 // Only pending exact paths are deletable under RLS. Clearing a previous failed
 // pending attempt cannot delete a ready screenshot or anyone else's object.
 const cleared=await client.storage.from(SUPPORT_BUCKET).remove([ticket.screenshot_path]);if(cleared.error) throw new Error("Ticket saved, but the unfinished screenshot could not be cleared. Retry this unchanged form.");
 const uploaded=await client.storage.from(SUPPORT_BUCKET).upload(ticket.screenshot_path,image.data,{contentType:"image/webp",upsert:false});
 if(uploaded.error) throw new Error("Ticket saved, but screenshot upload failed. Retry this unchanged form.");
 const result=await admin.rpc("finalize_support_screenshot",{p_id:ticket.id,p_user_id:userId,p_width:image.width,p_height:image.height,p_bytes:image.size});
 if(result.error) {
  // A lost successful response must not cause deletion of a certified image.
  // Live Storage DELETE policy restricts removal to the caller's pending rows.
  await client.storage.from(SUPPORT_BUCKET).remove([ticket.screenshot_path]);
  throw new Error("Ticket saved, but screenshot confirmation was unsuccessful. Retry this unchanged form; unfinished data remains private.");
 }
}
