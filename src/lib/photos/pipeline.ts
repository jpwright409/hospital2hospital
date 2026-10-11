import { PHOTO_BUCKET } from "./image";
import type { SupabaseClient } from "@supabase/supabase-js";
// Compensation claims a specific journal row. No prefix-based or bucket-wide deletion.
export async function cleanupPhoto(admin: SupabaseClient,id: string,staleOnly = true) {
  const claim = await admin.rpc("claim_photo_cleanup",{p_photo_id:id,p_stale_only:staleOnly});
  if (claim.error) throw claim.error;
  if (!claim.data) return;
  const removal = await admin.storage.from(PHOTO_BUCKET).remove([claim.data]);
  if (removal.error) throw removal.error;
  const finish = await admin.rpc("finish_photo_cleanup",{p_photo_id:id});
  if (finish.error) throw finish.error;
}
export async function uploadValidatedPhoto(client: SupabaseClient,admin: SupabaseClient,listingId: string,image: {data: Uint8Array; width:number;height:number;size:number}) {
  const reserve = await client.rpc("reserve_listing_photo",{p_listing_id:listingId});
  if(reserve.error) throw reserve.error;
  const photo = reserve.data as {id:string;object_path:string};
  try {
    const uploaded = await client.storage.from(PHOTO_BUCKET).upload(photo.object_path,image.data,{contentType:"image/webp",cacheControl:"60",upsert:false});
    if(uploaded.error) throw uploaded.error;
    const finalized = await admin.rpc("finalize_listing_photo",{p_photo_id:photo.id,p_width:image.width,p_height:image.height,p_size:image.size});
    if(finalized.error) throw finalized.error;
    return photo.id;
  } catch(error) {
    // If finalization committed but its response was lost, cleanup cannot remove
    // a ready row. Retry errors do not erase a successfully published image.
    try { await cleanupPhoto(admin,photo.id,false); }
    catch { throw new Error("Photo upload did not complete and cleanup is pending. Reload the photo manager; retry removal or run the documented orphan cleanup."); }
    throw error;
  }
}
