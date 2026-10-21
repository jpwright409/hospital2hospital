"use server";
import {revalidatePath} from "next/cache";
import {requirePlatformAdministrator,serviceError} from "@/lib/auth/server";
import {createUserAdmin} from "@/lib/supabase/user-admin";
import {getSiteUrl} from "@/lib/app-mode";
import {validUuid} from "@/lib/auth/policy";
import {performUserAdminOperation} from "@/lib/auth/user-admin-operation.mjs";
import type {ActionState} from "./auth/actions";

export async function manageUser(_state:ActionState,form:FormData):Promise<ActionState>{
 const {supabase}=await requirePlatformAdministrator();
 const field=(key:string)=>String(form.get(key)??"").trim();
 const id=field("request_id"),action=field("operation"),targetId=field("user_id")||null;
 const email=field("email").toLowerCase(),expectedEmail=field("expected_email").toLowerCase(),name=field("name"),reason=field("reason");
 if(form.get("confirm")!=="yes"||!validUuid(id)||!['invite','email','disable','enable','reset'].includes(action)||(targetId&&!validUuid(targetId)))return {error:"Choose an account action and confirm the request."};
 let admin:ReturnType<typeof createUserAdmin>;
 try{admin=createUserAdmin();}catch(e){return {error:(e as Error).message};}
 const begin=await supabase.rpc("begin_account_admin_action",{p_id:id,p_action:action,p_target:targetId,p_email:email,p_name:name,p_expected_email:expectedEmail,p_reason:reason});
 if(begin.error)return {error:serviceError(begin.error)};
 if(!begin.data?.execute)return begin.data?.state==='succeeded'?{success:"This request already completed; it was not repeated."}:{error:"This request has already been attempted. Check the directory and audit before starting a new request."};
 const token=begin.data.token;let success:boolean|null=false;
 try{
  const permission=await supabase.rpc("is_platform_administrator");
  if(permission.error||permission.data!==true)throw new Error("Administrator access changed. Nothing further was requested.");
  // From this point a network failure may have an uncertain external outcome.
  success=null;
  const createdId=await performUserAdminOperation(admin,{action,targetId,email,expectedEmail,name},`${getSiteUrl()}/auth/accept-account`);
  const finished=await admin.rpc("finish_account_admin_action",{p_id:id,p_token:token,p_success:true,p_created_user:createdId});
  if(finished.error)throw new Error("Account operation may have completed but the audit could not be finalized.");
  success=true;revalidatePath("/admin/users");
  return {success:action==='invite'?"Account invitation requested. The recipient must accept it and set their password. No facility membership or platform role was granted.":action==='reset'?"Password reset email requested for the account's current verified address.":action==='disable'?"Account disabled. Existing authenticated application/database access is blocked.":action==='enable'?"Account enabled. The user may sign in again.":"Login email updated administratively. Ask the account owner to sign in with the new address."};
 }catch{
  if(success!==true)await admin.rpc("finish_account_admin_action",{p_id:id,p_token:token,p_success:success,p_created_user:null});
  revalidatePath("/admin/users");
  return {error:"The operation could not be confirmed. Check the user directory, audit and Supabase Auth before retrying. A requested disable remains blocked for safety; email delivery depends on Supabase SMTP."};
 }
}
