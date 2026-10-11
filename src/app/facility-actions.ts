"use server";
import { revalidatePath } from "next/cache";
import { loadAccount, requireUser, serviceError } from "@/lib/auth/server";
import type { ActionState } from "./auth/actions";
export async function updateContacts(_state:ActionState,form:FormData):Promise<ActionState> {
 const account=await loadAccount();if(!account.active) return {error:"Select a facility first."};
 if(String(form.get("facility_id"))!==account.active.id) return {error:"The active facility changed. Refresh before updating contacts."};
 const contact:Record<string,string|boolean>={};
 for(const key of ["business_name","business_email","business_phone","secondary_name","secondary_email","secondary_phone"]) contact[key]=String(form.get(key)??"").trim();
 contact.share_business_contact=form.get("share_business_contact")==="yes";
 const {supabase}=await requireUser();const {error}=await supabase.rpc("set_facility_contacts",{p_id:account.active.id,p_contact:contact});
 if(error) return {error:serviceError(error)};
 revalidatePath("/account/contacts");return {success:"Facility contacts updated. Secondary contact information remains private and grants no account access."};
}
