"use client";
import {useActionState,useCallback,useEffect,useRef,useState} from "react";
import {useRouter} from "next/navigation";
import {bulkManageUsers} from "@/app/user-admin-actions";
import {bulkUserEligible} from "@/lib/auth/bulk-users.mjs";
import {UserManagementForm,type ManagedUser} from "./user-management";

type Operation='disable'|'remove'|'reset';
type Target={id:string;email:string;requestId:string};
type Batch={operation:Operation;targets:Target[]};
const labels={disable:'Disable accounts',remove:'Permanently remove accounts',reset:'Send password reset links'};
function BatchConfirmation({batch,close,busy}:{batch:Batch;close:()=>void;busy:(value:boolean)=>void}){
 const [state,action,pending]=useActionState(bulkManageUsers,{});
 useEffect(()=>{busy(pending);return()=>busy(false);},[pending,busy]);
 return <><h2>{labels[batch.operation]}</h2><p>{batch.targets.length} selected account{batch.targets.length===1?'':'s'}. Each account is checked and audited separately.</p>
  <ul className="bulk-targets">{batch.targets.map(t=><li key={t.id}>{t.email}</li>)}</ul>
  {batch.operation==='remove'&&<p className="error">Permanent removal cannot be undone. Shared business history is retained. Administrators and facility owners cannot be removed here. Use Disable for temporary restrictions.</p>}
  {batch.operation==='reset'&&<p className="notice">This sends real password recovery emails to confirmed, enabled accounts. Do not send resets to addresses you have not verified. Email actions are limited to 20 per hour.</p>}
  <form action={action} className="account-form user-management-form" aria-busy={pending}><fieldset disabled={pending||!!state.results}>
   <input type="hidden" name="operation" value={batch.operation}/><input type="hidden" name="targets" value={JSON.stringify(batch.targets)}/>
   <label>Reason / audit note<textarea name="reason" required minLength={10} maxLength={500} rows={2}/></label>
   {batch.operation==='remove'&&<label>Type REMOVE to confirm<input name="remove_confirmation" required pattern="REMOVE" autoComplete="off"/></label>}
   <label className="user-admin-confirm"><input type="checkbox" name="confirm" value="yes" required/>I have reviewed these accounts and confirm this action.</label>
  </fieldset>{state.error&&<p className="error" role="alert">{state.error}</p>}
  {state.results&&<div className="bulk-results" role="status"><h3>Results</h3><ul>{state.results.map(r=><li key={r.id}><strong>{r.email}</strong><p className={r.error?'error':'notice'}>{r.error??r.success}</p></li>)}</ul><p>Review failures or uncertain outcomes in the audit before starting another request. Accounts without a result were not processed.</p></div>}
  <div className="profile-dialog-actions"><button className={`button ${batch.operation==='remove'?'danger':'primary'}`} disabled={pending||!!state.results}>{pending?'Processing selected accounts…':labels[batch.operation]}</button><button type="button" className="button secondary" disabled={pending} onClick={close}>{state.results?'Close':'Cancel'}</button></div>
 </form></>;
}

export function UserDirectory({users}:{users:ManagedUser[]}){
 const router=useRouter(),dialog=useRef<HTMLDialogElement>(null),busy=useRef(false),trigger=useRef<HTMLElement|null>(null);
 const [dialogBusy,setDialogBusy]=useState(false);
 const [operation,setOperation]=useState<Operation>('disable'),[selected,setSelected]=useState<Set<string>>(new Set()),[batch,setBatch]=useState<Batch|null>(null),[editing,setEditing]=useState<ManagedUser|null>(null),[session,setSession]=useState(0);
 const eligible=users.filter(u=>bulkUserEligible(u,operation));const chosen=eligible.filter(u=>selected.has(u.id));const all=eligible.length>0&&chosen.length===eligible.length;
 function show(){trigger.current=document.activeElement as HTMLElement;setSession(v=>v+1);requestAnimationFrame(()=>dialog.current?.showModal());}
 function openBatch(action:Operation,targets:ManagedUser[]){setEditing(null);setBatch({operation:action,targets:targets.map(u=>({id:u.id,email:u.email,requestId:crypto.randomUUID()}))});show();}
 function openEdit(user:ManagedUser){setBatch(null);setEditing(user);show();}
 const close=useCallback(()=>{if(!busy.current)dialog.current?.close();},[]);const setBusy=useCallback((value:boolean)=>{busy.current=value;setDialogBusy(value);},[]);
 const date=(value?:string|null)=>value?new Date(value).toLocaleDateString('en-US',{timeZone:'UTC'}):'—';
 return <><div className="bulk-user-toolbar"><label className="user-admin-confirm"><input type="checkbox" checked={all} disabled={!eligible.length} ref={node=>{if(node)node.indeterminate=chosen.length>0&&!all;}} onChange={()=>setSelected(all?new Set():new Set(eligible.map(u=>u.id)))}/>Select eligible accounts on this page</label><label>Bulk action<select value={operation} onChange={e=>{setOperation(e.target.value as Operation);setSelected(new Set());}}><option value="disable">Disable</option><option value="remove">Remove permanently</option><option value="reset">Send password reset</option></select></label><button className="button secondary" disabled={!chosen.length} onClick={()=>openBatch(operation,chosen)}>Review {chosen.length} selected</button></div>
 <p className="muted user-selection-help">Up to 20 accounts per batch. Selection is limited to this page and action. Protected or ineligible accounts cannot be selected.</p>
 <div className="user-list-heading" aria-hidden="true"><span/><span>Account</span><span>Status / facility access</span><span>Quick actions</span></div>
 <ul className="user-directory-list">{users.map(u=><li className="user-directory-row" key={`${u.id}-${u.email}-${u.disabled}`}>
  <input type="checkbox" aria-label={`Select ${u.email}`} checked={chosen.some(c=>c.id===u.id)} disabled={!bulkUserEligible(u,operation)} onChange={()=>setSelected(previous=>{const next=new Set(previous);if(next.has(u.id))next.delete(u.id);else next.add(u.id);return next;})}/>
  <div className="user-row-identity"><strong>{u.display_name||'Unnamed account'}</strong><p>{u.email}</p><small>Joined {date(u.created_at)} · Last sign-in {date(u.last_sign_in_at)}</small></div>
  <div className="user-row-status"><span className="badge">{u.disabled?'Disabled':'Enabled'}</span><span className="badge">{u.email_confirmed_at?'Confirmed':'Unconfirmed'}</span>{u.platform_administrator?<span className="badge">Protected administrator</span>:<small>{u.facility_owner?'Facility owner':`${u.facility_count??0} active memberships`}</small>}{u.action_pending&&<a href="#account-audit">Unresolved action · review audit</a>}</div>
  <div className="user-row-actions"><button className="button secondary" disabled={!bulkUserEligible(u,'reset')} onClick={()=>openBatch('reset',[u])}>Reset link</button><button className="button secondary" disabled={!bulkUserEligible(u,'disable')} onClick={()=>openBatch('disable',[u])}>Disable</button><button className="button secondary user-remove-button" disabled={!bulkUserEligible(u,'remove')} title={u.facility_owner?'Transfer facility ownership before removal':undefined} onClick={()=>openBatch('remove',[u])}>Remove</button><button className="button secondary" disabled={u.action_pending} onClick={()=>openEdit(u)}>{u.disabled&&!u.platform_administrator?'Enable / edit':'More'}</button></div>
 </li>)}</ul>
 <dialog ref={dialog} className="profile-dialog user-action-dialog" aria-label="Review account action" onCancel={e=>{if(busy.current)e.preventDefault();}} onClose={()=>{setBatch(null);setEditing(null);setSelected(new Set());trigger.current?.focus();router.refresh();}}>
  {batch?<BatchConfirmation key={session} batch={batch} close={close} busy={setBusy}/>:editing?<><h2>Manage {editing.email}</h2><UserManagementForm key={session} requestId={crypto.randomUUID()} user={editing} initialOperation={editing.disabled&&!editing.platform_administrator?'enable':'reset'} onBusyChange={setBusy}/><div className="profile-dialog-actions"><button className="button secondary" disabled={dialogBusy} onClick={close}>Close</button></div></>:null}
 </dialog></>;
}
