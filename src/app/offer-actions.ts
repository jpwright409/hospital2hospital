"use server";
import {revalidatePath} from "next/cache";
import {loadAccount,requireUser,serviceError} from "@/lib/auth/server";
import {validUuid} from "@/lib/auth/policy";
import type {InventoryState} from "@/lib/inventory/types";
const field=(f:FormData,k:string)=>String(f.get(k)??"").trim();
const price=(value:string)=>/^\d{1,10}(\.\d{1,2})?$/.test(value)&&Number(value)<=9999999999.99;
export async function purchaseOfferAction(_state:InventoryState,form:FormData):Promise<InventoryState>{
 const account=await loadAccount();const {supabase}=await requireUser();
 if(!account.active||!account.capabilities.canInquire||field(form,"facility_id")!==account.active.id)return {error:"Select the participant facility and refresh before submitting."};
 const action=field(form,"action"),request=field(form,"request_id"),conversation=field(form,"conversation_id");
 if(!validUuid(request)||!validUuid(conversation)||form.get("confirm")!=="yes")return {error:"Review and confirm the action before submitting."};
 let result;
 if(action==="request"){
  const mode=field(form,"price_mode"),quantity=field(form,"quantity"),revision=field(form,"listing_revision"),amount=field(form,"unit_price");
  if(!/^\d{1,10}$/.test(quantity)||Number(quantity)<1||Number(quantity)>1000000000||!/^\d{1,10}$/.test(revision)||!["list","custom"].includes(mode)||(mode==="custom"&&!price(amount)))return {error:"Choose a valid quantity and USD unit price with at most two decimal places."};
  result=await supabase.rpc("send_purchase_offer",{p_request_id:request,p_conversation_id:conversation,p_facility_id:account.active.id,p_listing_revision:Number(revision),p_quantity:Number(quantity),p_price_mode:mode,p_unit_price:mode==="custom"?amount:null});
 }else{
  const id=field(form,"offer_id"),revision=field(form,"revision"),amount=field(form,"unit_price"),carrier=field(form,"carrier"),tracking=field(form,"tracking_number");
  if(!validUuid(id)||!/^\d{1,10}$/.test(revision)||!["accept","deny","counter","decline","withdraw","ship"].includes(action)||(action==="counter"&&!price(amount))||(action==="ship"&&(!["FedEx","UPS"].includes(carrier)||tracking.length>100||/[\u0000-\u001f\u007f]/.test(tracking))))return {error:"Review the offer action, counter price or shipping details."};
  result=await supabase.rpc("act_purchase_offer",{p_request_id:request,p_offer_id:id,p_facility_id:account.active.id,p_revision:Number(revision),p_action:action,p_unit_price:action==="counter"?amount:null,p_carrier:action==="ship"?carrier:null,p_tracking:action==="ship"?tracking:""});
 }
 if(result.error)return {error:serviceError(result.error)};
 for(const path of ["/account","/account/offers","/notifications","/inbox",`/inbox/${conversation}`,"/dashboard","/marketplace","/saved"])revalidatePath(path);
 revalidatePath("/listings/[id]","page");
 return {success:action==="ship"?"Shipment confirmation added to the conversation.":"Offer updated and recorded in the conversation."};
}
