import "server-only";
import { createClient } from "@/lib/supabase/server";
import { inventoryError } from "./errors";
export { inventoryError } from "./errors";
import { type InventoryListing, type InventoryQuery, type SearchResult, type CatalogProduct } from "./types";
import { listingPhotos } from "@/lib/photos/server";
export async function searchInventory(query: InventoryQuery, options: {facilityId?: string; saved?: boolean} = {}): Promise<SearchResult> {
  const supabase = await createClient();
  const {data,error} = await supabase.rpc("search_inventory_v2",{p_query: query.q,p_category:query.category,p_manufacturer:query.manufacturer,
    p_location:query.location,p_sort:query.sort,p_page:query.page,p_page_size:12,p_facility_id:options.facilityId ?? null,p_saved:options.saved ?? false,p_status:query.status,p_seller_facility_id:query.seller_facility || null,p_procedure_type:query.procedure,p_product_kind:query.kind});
  if (error) throw new Error(inventoryError(error));
  if (!data || !Array.isArray(data.items)) throw new Error("Inventory returned an invalid response. Retry and verify the inventory migrations.");
  const result=data as SearchResult;
  const photos=await listingPhotos(result.items.map(l=>l.id));
  return {...result,items:result.items.map(l=>({...l,photos:photos.filter(p=>p.listing_id===l.id)}))};
}
export async function inventoryFilters() {
  const supabase = await createClient();
  const {data,error} = await supabase.rpc("inventory_filter_options");
  if (error) throw new Error(inventoryError(error));
  return data as {manufacturers: {id:string;name:string}[];categories:string[];facilities:{id:string;name:string}[]};
}
export async function getInventoryListing(id: string): Promise<InventoryListing | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const {data,error} = await (await createClient()).from("marketplace_inventory").select("*").eq("id",id).is("deleted_at",null).maybeSingle();
  if (error) throw new Error(inventoryError(error));
  return data;
}
export async function catalogProducts(q = ""): Promise<CatalogProduct[]> {
  const supabase = await createClient();
  let request = supabase.from("products").select("id,manufacturer_id,catalog_number,name,category,description,product_kind,manufacturers(name)").order("name").limit(50);
  // Escape PostgREST grammar and LIKE wildcards; catalog lookup uses literal text.
  const safe = q.slice(0,100).replace(/[%_*(),.\\]/g," ").trim();
  if (safe) request = request.or(`name.ilike.%${safe}%,catalog_number.ilike.%${safe}%`);
  const {data,error} = await request;
  if (error) throw new Error(inventoryError(error));
  return (data ?? []).map(p => ({...p,manufacturer:(p.manufacturers as unknown as {name: string}).name}));
}
