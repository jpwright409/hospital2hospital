"use server";
import {revalidatePath} from "next/cache";
import {requireUser,requirePlatformAdministrator,serviceError} from "@/lib/auth/server";
import {validatePhoto,MAX_PHOTO_BYTES} from "@/lib/photos/image";
import {createSupportAdmin} from "@/lib/support/server";
import {uploadSupportScreenshot} from "@/lib/support/pipeline";
import type {SupportState} from "@/lib/support/types";
export async function submitSupport(_state:SupportState,form:FormData):Promise<SupportState> {
 const {supabase,user}=await requireUser();let ticketId:string|undefined;
 try {
  const input=form.get("screenshot");const file=input instanceof File && input.size>0 ? input : null;
  if(file && file.size>MAX_PHOTO_BYTES) return {error:"Choose a JPEG, PNG or WebP screenshot up to 5 MB."};
  // Validation/config failures precede ticket creation; text-only tickets need no secret.
  const admin=file ? createSupportAdmin() : null;
  const image=file ? await validatePhoto(new Uint8Array(await file.arrayBuffer())) : null;
  const field=(key:string)=>String(form.get(key)??"").trim();
  const result=await supabase.rpc("submit_support_ticket",{p_id:field("ticket_id"),p_contact:{name:field("contact_name"),email:field("contact_email"),phone:field("contact_phone"),facility:field("facility_name")},p_issue:field("issue"),p_screenshot:!!file});
  if(result.error) return {error:serviceError(result.error)};
  ticketId=result.data.id;
  if(image && admin) await uploadSupportScreenshot(supabase,admin,result.data,user.id,image);
  revalidatePath("/help");revalidatePath("/admin/support");
  return {success:`Support ticket ${ticketId} submitted${file ? " with screenshot" : ""}. You can track its status below.`,ticketId};
 }catch(error) {revalidatePath("/help");return {ticketId,error:error instanceof Error ? error.message : serviceError(error)};}
}
export async function updateSupportStatus(_state:SupportState,form:FormData):Promise<SupportState> {
 const {supabase}=await requirePlatformAdministrator();
 const {error}=await supabase.rpc("set_support_ticket_status",{p_id:String(form.get("ticket_id")??""),p_status:String(form.get("status")??"")});
 if(error) return {error:serviceError(error)};
 revalidatePath("/admin/support");revalidatePath("/help");return {success:"Support status updated."};
}
