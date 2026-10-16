import Link from "next/link";
import {randomUUID} from "node:crypto";
import {notFound,redirect} from "next/navigation";
import {loadAccount,serviceError} from "@/lib/auth/server";
import {createClient} from "@/lib/supabase/server";
import {catalogProducts,getInventoryListing} from "@/lib/inventory/server";
import type {CatalogProduct,SearchParams,WizardDraft} from "@/lib/inventory/types";
import {ListingWizard} from "./listing-wizard";
import {validUuid} from "@/lib/auth/policy";

export async function ConnectedWizard({params}:{params:SearchParams}){
 const account=await loadAccount(),supabase=await createClient();let draft:WizardDraft|undefined;
 if(params.draft){if(typeof params.draft!=="string"||!validUuid(params.draft))notFound();const result=await supabase.from("listing_wizard_drafts").select("*").eq("id",params.draft).maybeSingle();if(result.error)throw new Error(serviceError(result.error));if(!result.data)notFound();draft=result.data as WizardDraft;
  if(draft.listing_id){const listing=await getInventoryListing(draft.listing_id);if(!listing)notFound();if(listing.status!=="draft")redirect(`/listings/${listing.id}`);}
 }
 const facility=draft?account.facilities.find(f=>f.id===draft!.facility_id):account.active;
 const permission=facility?await supabase.rpc("wizard_can_manage",{p_facility_id:facility.id}):null;
 if(permission?.error)throw new Error(serviceError(permission.error));
 if(!facility||permission?.data!==true)return <div className="container page-section"><h1>Inventory access required</h1><p className="notice">Select an approved facility with an active owner or inventory editor membership to create a listing.</p><Link href="/account" className="button primary">My account</Link></div>;
 const products=await catalogProducts();const productId=draft?.product_id??(typeof params.product==="string"?params.product:"");let product=products.find(p=>p.id===productId);
 if(!product&&validUuid(productId)){const result=await supabase.from("products").select("*,manufacturers(name)").eq("id",productId).maybeSingle();if(result.error)throw new Error(serviceError(result.error));if(result.data)product={...result.data,manufacturer:result.data.manufacturers.name} as CatalogProduct;}
 return <ListingWizard key={draft?.id??"new"} requestId={draft?.id??randomUUID()} facility={facility} products={products} product={product} draft={draft}/>;
}
