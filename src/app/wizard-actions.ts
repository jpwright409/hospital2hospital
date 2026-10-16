"use server";
import {revalidatePath} from "next/cache";
import {authenticatedClient,serviceError} from "@/lib/auth/server";
import {getAppMode} from "@/lib/app-mode";
import {validUuid} from "@/lib/auth/policy";
import {validateInventory,wizardInventoryForm,type WizardDraft} from "@/lib/inventory/types";

type SaveInput={id:string;facilityId:string;productId:string;revision:number;data:Record<string,string>;step:number};
type Result={draft?:WizardDraft;listingId?:string;error?:string};
async function context(){
 if(getAppMode()!=="connected")throw new Error("Connected inventory is required.");
 const session=await authenticatedClient();if(!session.user?.email_confirmed_at)throw new Error("Sign in with a confirmed account, then retry. Your form is still on this page.");return session;
}
export async function saveListingWizard(input:SaveInput,prepare=false):Promise<Result>{
 let draft:WizardDraft|undefined;
 try{
  if(!validUuid(input.id)||!validUuid(input.facilityId)||!validUuid(input.productId))return {error:"Choose a product and facility."};
  const {supabase}=await context();
  const data=Object.fromEntries(Object.entries(input.data).map(([k,v])=>[k,typeof v==="string"?v.trim():v]));
  const saved=await supabase.rpc("save_listing_wizard",{p_id:input.id,p_facility_id:input.facilityId,p_product_id:input.productId,p_revision:input.revision,p_data:data,p_step:input.step});
  if(saved.error)return {error:serviceError(saved.error)};draft=saved.data as WizardDraft;
  if(prepare){
   if(!["capital","disposable"].includes(draft.data.inventory_kind))return {draft,error:"Choose capital equipment or disposable supplies before continuing."};
   try{validateInventory(wizardInventoryForm(draft.data));}catch(e){return {draft,error:(e as Error).message};}
   const ready=await supabase.rpc("prepare_listing_wizard",{p_id:draft.id,p_revision:draft.revision});
   if(ready.error)return {draft,error:serviceError(ready.error)};draft=ready.data as WizardDraft;
  }
  revalidatePath("/dashboard");return {draft};
 }catch(e){return {draft,error:e instanceof Error?e.message:"Draft could not be saved. Retry."};}
}
export async function publishListingWizard(id:string,revision:number):Promise<Result>{
 try{const {supabase}=await context();const result=await supabase.rpc("publish_listing_wizard",{p_id:id,p_revision:revision});if(result.error)return {error:serviceError(result.error)};
  for(const path of ["/dashboard","/marketplace","/saved"])revalidatePath(path);return {listingId:result.data};
 }catch(e){return {error:e instanceof Error?e.message:"Publishing failed. Retry."};}
}
export async function discardListingSetup(_state:{error?:string;success?:string},form:FormData){
 try{const {supabase}=await context();const result=await supabase.rpc("discard_listing_setup",{p_id:String(form.get("id")),p_revision:Number(form.get("revision"))});if(result.error)return {error:serviceError(result.error)};revalidatePath("/dashboard");return {success:"Setup draft removed."};}
 catch(e){return {error:e instanceof Error?e.message:"Unable to remove draft."};}
}
