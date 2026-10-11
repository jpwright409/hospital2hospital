"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireUser, loadAccount } from "@/lib/auth/server";
import { inventoryError } from "@/lib/inventory/server";
import { validateInventory, type InventoryState } from "@/lib/inventory/types";
const field = (form: FormData,key: string) => String(form.get(key) ?? "").trim();
function refresh(id?: string) {
  for (const path of ["/","/marketplace","/dashboard","/saved","/notifications",...(id ? [`/listings/${id}`,`/listings/${id}/edit`] : [])]) revalidatePath(path);
}
export async function saveInventory(_state: InventoryState,form: FormData): Promise<InventoryState> {
  const account = await loadAccount();
  let id = field(form,"listing_id");
  try {
    if (!account.active || !account.capabilities.canPublish) return {error:"Select an approved facility with an active owner or inventory editor membership in My account."};
    const inventory = validateInventory(form); const {supabase} = await requireUser();
    if (id) {
      // The database authorizes the listing's actual facility, never a client field.
      const {data:listing,error:readError} = await supabase.from("listings").select("facility_id").eq("id",id).maybeSingle();
      if (readError) throw readError;
      if (listing?.facility_id !== account.active.id) return {error:"This listing does not belong to your selected facility. Select its facility before editing."};
      const result = await supabase.rpc("update_inventory_listing",{p_listing_id:id,p_revision:Number(field(form,"revision")),p_inventory:inventory});
      if (result.error) throw result.error;
    } else {
      const productId = field(form,"product_id");
      const product = productId ? {id:productId} : {manufacturer:field(form,"manufacturer"),catalog_number:field(form,"catalog_number"),name:field(form,"name"),category:field(form,"category"),description:field(form,"description"),product_kind:field(form,"inventory_kind")};
      const result = await supabase.rpc("create_inventory_listing",{p_facility_id:account.active.id,p_product:product,p_inventory:inventory});
      if (result.error) throw result.error; id = result.data;
    }
  } catch (error) { return {error: error instanceof Error ? error.message : inventoryError(error)}; }
  refresh(id); redirect(`/listings/${id}`);
}
export async function changeInventoryStatus(_state: InventoryState,form: FormData): Promise<InventoryState> {
  const {supabase} = await requireUser(); const id = field(form,"listing_id"); const status = field(form,"status");
  if (!["active","inactive","sold"].includes(status)) return {error:"Choose a valid listing status."};
  const {error} = await supabase.rpc("update_inventory_listing",{p_listing_id:id,p_revision:Number(field(form,"revision")),p_inventory:{status}});
  if (error) return {error:inventoryError(error)};
  refresh(id); return {success:"Listing status updated."};
}
export async function changeSavedListing(_state: InventoryState,form: FormData): Promise<InventoryState> {
  const {supabase,user} = await requireUser(); const id = field(form,"listing_id");
  const result = field(form,"remove") === "yes"
    ? await supabase.from("saved_listings").delete().eq("user_id",user.id).eq("listing_id",id)
    : await supabase.from("saved_listings").upsert({user_id:user.id,listing_id:id},{onConflict:"user_id,listing_id",ignoreDuplicates:true});
  if (result.error) return {error:inventoryError(result.error)};
  refresh(id); return {success:field(form,"remove") === "yes" ? "Removed from saved listings." : "Listing saved to your account."};
}
export async function deleteInventory(_state:InventoryState,form:FormData):Promise<InventoryState> {
  if(field(form,"confirm")!=="yes") return {error:"Confirm deletion. Deactivate instead if you may reactivate this listing."};
  const {supabase}=await requireUser();
  const {error}=await supabase.rpc("delete_inventory_listing",{p_id:field(form,"listing_id"),p_revision:Number(field(form,"revision"))});
  if(error) return {error:inventoryError(error)};
  refresh(field(form,"listing_id"));return {success:"Listing deleted from inventory. Conversation history is preserved."};
}
