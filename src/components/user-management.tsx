"use client";
import {useActionState,useState} from "react";
import {manageUser} from "@/app/user-admin-actions";

export type ManagedUser={id:string;email:string;display_name:string;email_confirmed_at:string|null;disabled:boolean;platform_administrator:boolean};
export function UserManagementForm({requestId,user}:{requestId:string;user?:ManagedUser}){
 const [nonce,setNonce]=useState(requestId),[operation,setOperation]=useState(user?"reset":"invite");
 const [state,action,pending]=useActionState(manageUser,{});
 return <form action={action} className="account-form user-management-form" aria-busy={pending}><fieldset disabled={pending}>
  <input type="hidden" name="request_id" value={nonce}/><input type="hidden" name="user_id" value={user?.id??""}/><input type="hidden" name="expected_email" value={user?.email??""}/>
  {user?<label>Account action<select name="operation" value={operation} onChange={e=>{setOperation(e.target.value);setNonce(crypto.randomUUID());}}><option value="reset">Send password reset link</option>{!user.platform_administrator&&<><option value="email">Update login email</option><option value={user.disabled?"enable":"disable"}>{user.disabled?"Enable account":"Disable account"}</option><option value="remove">Permanently remove account</option></>}</select></label>:<><input type="hidden" name="operation" value="invite"/><label>Full name<input name="name" required minLength={2} maxLength={120}/></label></>}
  {(!user||operation==="email")&&<label>{user?"New login email":"Email address"}<input name="email" type="email" required maxLength={254}/></label>}
  {operation==="email"&&<p className="notice">This changes the login address administratively. Verify the new address with the account owner first. No email-verification message is sent automatically.</p>}
  {operation==="remove"&&<><p className="error">Permanent removal cannot be undone. This removes login access and personal saves/watchlists, while retaining shared facility records, messages and audit history. Facility owners must transfer ownership first. Use Disable for temporary restrictions.</p><label>Type {user?.email} to confirm removal<input name="remove_confirmation" type="email" required autoComplete="off" maxLength={254}/></label></>}
  <label>Reason / audit note<textarea name="reason" required minLength={10} maxLength={500} rows={2}/></label>
  <label className="user-admin-confirm"><input type="checkbox" name="confirm" value="yes" required/>I confirm this account action and have verified the intended recipient.</label>
 </fieldset>{state.error&&<p className="error" role="alert">{state.error}</p>}{state.success&&<p className="notice" role="status">{state.success}</p>}<div className="manage-actions"><button className={`button ${operation==='remove'?'danger':'primary'}`} disabled={pending}>{pending?"Processing…":operation==='remove'?"Permanently remove account":user?"Apply account action":"Create account & send invitation"}</button>{(state.error||state.success)&&<button className="button secondary" type="button" disabled={pending} onClick={()=>setNonce(crypto.randomUUID())}>Start a new request</button>}</div></form>;
}
