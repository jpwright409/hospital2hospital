import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { inventoryError } from "@/lib/inventory/errors";
import { listingPhotos } from "@/lib/photos/server";
import { ListingVisual } from "./listing-photos";
import type { InventoryListing } from "@/lib/inventory/types";
async function loadFeatured() {
 try {
  const client=await createClient();const result=await client.rpc('public_featured_inventory');
  if(result.error)throw new Error(inventoryError(result.error));
  const items=result.data as InventoryListing[];
  if(!Array.isArray(items))throw new Error('Featured listings returned an invalid response. Retry.');
  const photos=await listingPhotos(items.map(l=>l.id));
  return {items,photos,error:""};
 }catch(error){return {items:[],photos:[],error:(error as Error).message};}
}
export async function FeaturedListings() {
 const {items,photos,error}=await loadFeatured();
 return <aside className="featured-banner"><h2>Featured Listing</h2>{error?<p className="error" role="alert">{error} Refresh to retry.</p>:<>{items.map(l=><Link className="featured-listing" key={l.id} href={`/listings/${l.id}`}><ListingVisual photos={photos.filter(p=>p.listing_id===l.id)} name={l.name}/><div><strong>{l.name}</strong><small>{l.manufacturer} · {l.catalog_number}</small><small>{l.facility.name}</small><span>{new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(l.price_usd)} / {l.quantity_unit}{l.price_negotiable?' · Negotiable':''}</span></div></Link>)}{!items.length && <p className="muted">No featured listings right now. Approved sellers can submit a listing for review from My Facility.</p>}</>}</aside>;
}
