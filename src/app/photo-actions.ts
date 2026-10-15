"use server";
import { IMAGE_UPLOAD_LIMIT_LABEL } from "@/lib/upload-limits.mjs";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/server";
import { createPhotoAdmin } from "@/lib/supabase/photo-admin";
import { validatePhoto,MAX_PHOTO_BYTES } from "@/lib/photos/image";
import { cleanupPhoto,uploadValidatedPhoto } from "@/lib/photos/pipeline";
import { inventoryError } from "@/lib/inventory/server";
import type { InventoryState } from "@/lib/inventory/types";
function refresh(id:string) { for(const path of ["/","/marketplace","/saved",`/listings/${id}`,`/listings/${id}/edit`]) revalidatePath(path); }
const field=(form:FormData,key:string)=>String(form.get(key) ?? "");
export async function uploadPhoto(_state:InventoryState,form:FormData):Promise<InventoryState> {
  const {supabase}=await requireUser(); const id=field(form,"listing_id");
  try {
    const permission=await supabase.rpc("photo_can_manage",{p_listing_id:id});
    if(permission.error) throw permission.error;
    if(!permission.data) return {error:"Photo changes require active owner/editor membership in this listing’s approved facility."};
    const file=form.get("photo");
    if(!(file instanceof File) || !file.size || file.size>MAX_PHOTO_BYTES) return {error:`Choose one JPEG, PNG, or WebP file up to ${IMAGE_UPLOAD_LIMIT_LABEL}.`};
    const admin=createPhotoAdmin();
    const image=await validatePhoto(new Uint8Array(await file.arrayBuffer()));
    await uploadValidatedPhoto(supabase,admin,id,image);
    refresh(id); return {success:"Photo uploaded and validated."};
  } catch(error) { return {error:error instanceof Error ? error.message : inventoryError(error)}; }
}
export async function removePhoto(_state:InventoryState,form:FormData):Promise<InventoryState> {
  const {supabase}=await requireUser();
  try {
    const admin=createPhotoAdmin();
    const {data,error}=await supabase.rpc("remove_listing_photo",{p_photo_id:field(form,"photo_id")});
    if(error) throw error;
    if(!data) return {error:"Photo no longer exists. Reload the page."};
    await cleanupPhoto(admin,field(form,"photo_id"),false);
    refresh(field(form,"listing_id"));return {success:"Photo removed."};
  } catch(error) { return {error:error instanceof Error ? error.message : inventoryError(error)}; }
}
export async function arrangePhotos(_state:InventoryState,form:FormData):Promise<InventoryState> {
  const {supabase}=await requireUser();const id=field(form,"listing_id");
  const ids=field(form,"photo_ids").split(",").filter(Boolean);
  const {error}=await supabase.rpc("arrange_listing_photos",{p_listing_id:id,p_ids:ids,p_cover:field(form,"cover_id")});
  if(error) return {error:inventoryError(error)};
  refresh(id);return {success:"Photo order and cover saved."};
}
