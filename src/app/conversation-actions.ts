"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { loadAccount,requireUser,serviceError } from "@/lib/auth/server";
import { validUuid } from "@/lib/auth/policy";
import type { InventoryState } from "@/lib/inventory/types";
const field=(form:FormData,key:string)=>String(form.get(key) ?? "").trim();
export async function switchMessageFacility(_state:InventoryState,form:FormData):Promise<InventoryState> {
  const id=field(form,"facility_id");
  if(!validUuid(id)) return {error:"Choose an approved facility."};
  const {supabase}=await requireUser();
  const {error}=await supabase.rpc("select_message_facility",{p_facility_id:id});
  if(error) return {error:serviceError(error)};
  revalidatePath("/","layout");
  redirect("/inbox");
}
function messagePayload(form:FormData) {
  const body=field(form,"body");const request=field(form,"request_id");
  if(!body || body.length>4000 || !validUuid(request)) throw new Error("Enter a message of 1–4,000 characters. Refresh if the submission ID has expired.");
  return {body,request};
}
export async function contactSeller(_state:InventoryState,form:FormData):Promise<InventoryState> {
  const account=await loadAccount();const {supabase}=await requireUser();let id:string;
  try {
    if(!account.active || !account.capabilities.canInquire) return {error:"Select an approved facility with an eligible active membership before contacting a seller."};
    if(field(form,"facility_id")!==account.active.id) return {error:"Your active facility changed. Refresh and review the sending facility before submitting."};
    const {body,request}=messagePayload(form);
    const result=await supabase.rpc("contact_listing_seller",{p_listing_id:field(form,"listing_id"),p_buyer_facility_id:account.active.id,p_body:body,p_request_id:request});
    if(result.error) return {error:serviceError(result.error)};
    id=result.data;
  } catch(error) {return {error:error instanceof Error ? error.message : serviceError(error)};}
  revalidatePath("/inbox");redirect(`/inbox/${id}`);
}
export async function replyToConversation(_state:InventoryState,form:FormData):Promise<InventoryState> {
  const account=await loadAccount();const {supabase}=await requireUser();const id=field(form,"conversation_id");
  try {
    if(!account.active || !account.capabilities.canInquire) return {error:"Select an approved participant facility with conversation access."};
    if(field(form,"facility_id")!==account.active.id) return {error:"Your active facility changed. Refresh and review the sending facility before submitting."};
    const {body,request}=messagePayload(form);
    const result=await supabase.rpc("reply_to_conversation",{p_id:id,p_facility_id:account.active.id,p_body:body,p_request_id:request});
    if(result.error) return {error:serviceError(result.error)};
    revalidatePath("/inbox");revalidatePath(`/inbox/${id}`);return {success:"Message sent."};
  } catch(error) {return {error:error instanceof Error ? error.message : serviceError(error)};}
}
export async function markConversationRead(_state:InventoryState,form:FormData):Promise<InventoryState> {
  const {supabase}=await requireUser();
  const {error}=await supabase.rpc("mark_conversation_read",{p_id:field(form,"conversation_id"),p_through_sequence:Number(field(form,"sequence"))});
  if(error) return {error:serviceError(error)};
  revalidatePath("/inbox");return {success:"Read status updated."};
}
