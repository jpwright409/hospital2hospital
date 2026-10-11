"use client";
import { useActionState, useRef, useState } from "react";
import { submitBoost, reviewBoost } from "@/app/boost-actions";
import { ActionForm } from "./account-forms";
type FacilityOption = {id:string;name:string;listings:{id:string;name:string;catalog_number:string}[]};
function BoostRequestForm({facilities,activeId,close,busy,success}:{facilities:FacilityOption[];activeId:string;close:()=>void;busy:(value:boolean)=>void;success:(message:string)=>void}) {
 const [facility,setFacility]=useState(facilities.some(f=>f.id===activeId)?activeId:facilities[0]?.id??"");
 const selected=facilities.find(f=>f.id===facility);
 const [state,action,pending]=useActionState(async(previous:{error?:string;success?:string},form:FormData)=>{
  busy(true);try{const result=await submitBoost(previous,form);if(result.success){success(result.success);close();}return result;}finally{busy(false);}
 },{});
 return <form action={action} aria-busy={pending}><h2>Boost a listing</h2><p className="muted">Submit an active listing for platform administrator review. Boosting is free for now.</p>
  <fieldset className="profile-fields" disabled={pending}><label>Facility<select name="facility_id" required value={facility} onChange={e=>setFacility(e.target.value)}>{facilities.map(f=><option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
  <label>Active listing<select key={facility} name="listing_id" required defaultValue=""><option value="" disabled>Choose a listing</option>{selected?.listings.map(l=><option key={l.id} value={l.id}>{l.name} · {l.catalog_number}</option>)}</select></label></fieldset>
  {!facilities.length && <p className="notice">No eligible facilities. An approved facility with active owner or inventory editor membership is required.</p>}
  {selected && !selected.listings.length && <p className="notice">This facility has no active listings. Create or reactivate inventory before requesting a boost.</p>}
  {selected?.listings.length===500 && <p className="muted">Showing the first 500 active listings alphabetically.</p>}
  {state.error && <p className="error" role="alert">{state.error}</p>}
  <div className="profile-dialog-actions"><button className="button primary" disabled={pending||!selected?.listings.length}>{pending?"Submitting…":"Submit for boosting"}</button><button type="button" className="button secondary" disabled={pending} onClick={close}>Cancel</button></div>
 </form>;
}
export function BoostListing({activeId}:{activeId:string}) {
 const dialog=useRef<HTMLDialogElement>(null);const trigger=useRef<HTMLButtonElement>(null);const pending=useRef(false);
 const [facilities,setFacilities]=useState<FacilityOption[]>([]);const [loading,setLoading]=useState(false);const [error,setError]=useState("");const [notice,setNotice]=useState("");const [session,setSession]=useState(0);
 async function open(){setLoading(true);setError("");dialog.current?.showModal();try{
  const response=await fetch('/api/boost-options',{cache:'no-store'});const result=await response.json();
  if(!response.ok || !Array.isArray(result.facilities))throw new Error(result.error||'Unable to load eligible listings. Retry.');
  setFacilities(result.facilities);setSession(v=>v+1);
 }catch(e){setError((e as Error).message);}finally{setLoading(false);}}
 return <><button ref={trigger} type="button" className="button boost-button" onClick={open}>Boost a listing</button>{notice && <p className="notice" role="status">{notice}</p>}
 <dialog ref={dialog} className="profile-dialog boost-dialog" aria-label="Boost a listing" onClose={()=>trigger.current?.focus()} onCancel={e=>{if(pending.current)e.preventDefault();}}>
 {loading?<><p role="status">Loading your facilities and active inventory…</p><button type="button" className="button secondary" onClick={()=>dialog.current?.close()}>Cancel</button></>:error?<><p className="error" role="alert">{error}</p><div className="profile-dialog-actions"><button className="button primary" onClick={open}>Retry</button><button className="button secondary" onClick={()=>dialog.current?.close()}>Cancel</button></div></>:<BoostRequestForm key={session} facilities={facilities} activeId={activeId} close={()=>dialog.current?.close()} busy={v=>{pending.current=v;}} success={setNotice}/>}
 </dialog></>;
}
export function BoostReview({id,revision,slot}:{id:string;revision:number;slot:number|null}) {
 return <ActionForm action={reviewBoost} submit="Save decision"><input type="hidden" name="id" value={id}/><input type="hidden" name="revision" value={revision}/>
 <div className="form-grid"><label>Decision<select name="decision" defaultValue=""><option value="" disabled>Choose a decision</option><option value="approved">Approve / feature</option><option value="rejected">Reject</option><option value="ended">Remove from featured</option></select></label>
 <label>Featured slot<select name="slot" defaultValue={slot??1}><option value="1">Slot 1</option><option value="2">Slot 2</option></select><small>Approving replaces the current listing in this slot.</small></label></div><label>Review note (optional)<textarea name="note" maxLength={1000}/></label>
 </ActionForm>;
}
