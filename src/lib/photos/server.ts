import "server-only";
import { createClient } from "@/lib/supabase/server";
import { inventoryError } from "@/lib/inventory/errors";
import { PHOTO_BUCKET,PHOTO_URL_SECONDS } from "./image";
export type ListingPhoto = {id:string;listing_id:string;object_path:string;state:string;position:number;is_cover:boolean;width:number|null;height:number|null;url?:string};
export async function listingPhotos(ids: string[],includePending=false): Promise<ListingPhoto[]> {
  if (!ids.length) return [];
  const client = await createClient();
  let query = client.from("listing_photos").select("id,listing_id,object_path,state,position,is_cover,width,height").in("listing_id",ids).order("is_cover",{ascending:false}).order("position").order("id");
  if (!includePending) query=query.eq("state","ready");
  const {data,error}=await query;
  if(error) throw new Error(inventoryError(error));
  const photos = (data ?? []) as ListingPhoto[];
  const ready = photos.filter(p=>p.state==='ready');
  if (!ready.length) return photos;
  // Sign with the caller's ordinary identity, including anon for public listings.
  // The private bucket's RLS, not an admin key, decides what may be signed.
  const signed = await client.storage.from(PHOTO_BUCKET).createSignedUrls(ready.map(p=>p.object_path),PHOTO_URL_SECONDS);
  if(signed.error || signed.data?.some(p=>p.error || !p.signedUrl)) throw new Error("Photos could not be loaded. Retry and check the private bucket and Storage policies.");
  const urls=new Map(signed.data?.map(p=>[p.path,p.signedUrl]));
  return photos.map(p=>({...p,url:urls.get(p.object_path) ?? undefined}));
}
