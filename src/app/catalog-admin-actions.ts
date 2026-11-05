"use server";
import {revalidatePath} from "next/cache";
import {requirePlatformAdministrator,serviceError} from "@/lib/auth/server";
import {validUuid} from "@/lib/auth/policy";
import type {ActionState} from "./auth/actions";
const field=(form:FormData,key:string)=>String(form.get(key)??"").trim();
function identity(form:FormData){
 const id=field(form,"id"),requestId=field(form,"request_id"),revision=Number(field(form,"revision"));
 if(!validUuid(id)||!validUuid(requestId)||!Number.isSafeInteger(revision)||revision<1)throw new Error("Refresh the review form before continuing.");
 return {id,requestId,revision};
}
function refreshReviews(){
 for(const path of ["/admin/catalog","/admin/products","/admin/listings","/marketplace","/saved","/dashboard","/listings/new","/products/submit"])revalidatePath(path);
 revalidatePath("/listings/[id]","page");
}
export async function manageCatalogProduct(_state:ActionState,form:FormData):Promise<ActionState>{
 const {supabase}=await requirePlatformAdministrator();
 let ids;try{ids=identity(form);}catch{return {error:"Refresh the review form before continuing."};}
 const operation=field(form,"operation");
 if(!["update","archive","restore"].includes(operation))return {error:"Choose a catalog action."};
 const product=operation==="update"?Object.fromEntries(["manufacturer_id","catalog_number","name","category","description","product_kind","gtin"].map(key=>[key,field(form,key)])):{};
 const result=await supabase.rpc("admin_manage_catalog_product",{p_request_id:ids.requestId,p_id:ids.id,p_revision:ids.revision,p_action:operation,p_product:product,p_reason:field(form,"reason"),p_confirm:form.get("confirm")==="yes"});
 if(result.error)return {error:serviceError(result.error)};
 refreshReviews();
 return {success:operation==="archive"?"Product deleted from future catalog selections. Existing listings and history were preserved.":operation==="restore"?"Product restored to the catalog.":"Shared product information updated."};
}
export async function moderateMarketplaceListing(_state:ActionState,form:FormData):Promise<ActionState>{
 const {supabase}=await requirePlatformAdministrator();
 let ids;try{ids=identity(form);}catch{return {error:"Refresh the review form before continuing."};}
 const decision=field(form,"operation");
 if(!["reject","release"].includes(decision))return {error:"Choose a listing decision."};
 const result=await supabase.rpc("admin_moderate_listing",{p_request_id:ids.requestId,p_id:ids.id,p_revision:ids.revision,p_decision:decision,p_reason:field(form,"reason"),p_confirm:form.get("confirm")==="yes"});
 if(result.error)return {error:serviceError(result.error)};
 refreshReviews();
 return {success:decision==="reject"?"Listing rejected and removed from the marketplace. A facility notice was added; an email was queued when an eligible recipient was available.":"Rejection cleared. The listing remains unpublished until its facility republishes it."};
}
