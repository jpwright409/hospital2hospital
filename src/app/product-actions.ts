"use server";
import {revalidatePath} from "next/cache";
import {authenticatedClient,requirePlatformAdministrator,serviceError} from "@/lib/auth/server";
import {getAppMode} from "@/lib/app-mode";
import type {ActionState} from "./auth/actions";
const field=(form:FormData,key:string)=>String(form.get(key)??"").trim();
export async function submitProduct(_state:ActionState,form:FormData):Promise<ActionState>{
 try{
  if(getAppMode()!=="connected")return {error:"Connected inventory is required."};
  const {supabase,user}=await authenticatedClient();if(!user?.email_confirmed_at)return {error:"Sign in with a confirmed account to submit a product."};
  const product=Object.fromEntries(["manufacturer","catalog_number","name","category","description","product_kind"].map(key=>[key,field(form,key)]));
  const result=await supabase.rpc("submit_product_reference",{p_id:field(form,"id"),p_facility_id:field(form,"facility_id"),p_product:product});
  if(result.error)return {error:serviceError(result.error)};revalidatePath("/products/submit");revalidatePath("/admin/products");return {success:"Product submitted for administrator approval. It will appear in the product dropdown after approval."};
 }catch{return {error:"Product submission failed. Check your session and retry."};}
}
export async function reviewProduct(_state:ActionState,form:FormData):Promise<ActionState>{
 const {supabase}=await requirePlatformAdministrator();
 const result=await supabase.rpc("review_product_reference",{p_id:field(form,"id"),p_revision:Number(field(form,"revision")),p_decision:field(form,"decision"),p_note:field(form,"note")});
 if(result.error)return {error:serviceError(result.error)};
 for(const path of ["/admin/products","/products/submit","/listings/new"])revalidatePath(path);
 return {success:result.data?"Approved product is now available in the catalog. Existing shared records were preserved.":"Product submission rejected."};
}
