"use server";
import { revalidatePath } from "next/cache";
import { loadAccount,requireUser,serviceError } from "@/lib/auth/server";
import { validUuid } from "@/lib/auth/policy";
import { emailDeliveryConfigured } from "@/lib/email-config";
import type { ActionState } from "./auth/actions";
const field=(f:FormData,k:string)=>String(f.get(k)??"").trim();
export async function saveWatchlist(_s:ActionState,form:FormData):Promise<ActionState> {
 const {supabase,user}=await requireUser();const id=field(form,"id");
 if(!validUuid(id)) return {error:"Refresh the form and try again."};
 const criteria:Record<string,string>={};for(const key of ["q","catalog_number","manufacturer","procedure_type","product_kind"]) if(field(form,key)) criteria[key]=field(form,key);
 if(!Object.keys(criteria).length) return {error:"Choose at least one filter to watch."};
 const email=form.get("email_enabled")==="yes";
 if(email && !emailDeliveryConfigured()) return {error:"Email delivery is not configured. You can save this watchlist with email alerts unchecked."};
 const values={name:field(form,"name"),criteria,enabled:form.get("enabled")==="yes",email_enabled:email};
 const result=field(form,"existing")==="yes" ? await supabase.from("watchlists").update(values).eq("id",id).eq("user_id",user.id).select("id") : await supabase.from("watchlists").insert({...values,id,user_id:user.id}).select("id");
 if(result.error) return {error:serviceError(result.error)};
 if(!result.data?.length) return {error:"Watchlist unavailable to your account. Refresh and try again."};
 revalidatePath("/watchlist");return {success:email ? "Watchlist saved. Matching new listings will queue email alerts for the delivery worker." : "Watchlist saved. Matching new listings will appear here."};
}
export async function deleteWatchlist(_s:ActionState,form:FormData):Promise<ActionState> {
 const {supabase,user}=await requireUser();const {error}=await supabase.from("watchlists").delete().eq("id",field(form,"id")).eq("user_id",user.id);
 if(error) return {error:serviceError(error)};revalidatePath("/watchlist");return {success:"Watchlist removed; queued watchlist emails were removed too."};
}
export async function referFacility(_s:ActionState,form:FormData):Promise<ActionState> {
 if(!emailDeliveryConfigured()) return {error:"Referral email delivery is not configured. Contact the platform operator to enable the provider and delivery worker."};
 const account=await loadAccount();if(!account.active || !account.capabilities.canInquire) return {error:"Select an approved facility with an eligible membership to send a referral."};
 if(field(form,"facility_id")!==account.active.id) return {error:"Your active facility changed. Refresh before sending an invitation."};
 const {supabase}=await requireUser();const {error}=await supabase.rpc("refer_facility",{p_id:field(form,"id"),p_facility_id:account.active.id,p_email:field(form,"email")});
 if(error) return {error:serviceError(error)};
 return {success:"Invitation queued for email delivery. The recipient will register and complete normal facility approval; this invitation grants no membership or privileges."};
}
