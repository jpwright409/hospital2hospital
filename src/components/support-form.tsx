"use client";
import {useActionState,useRef,useState} from "react";
import {submitSupport,updateSupportStatus} from "@/app/support-actions";
import {ActionForm} from "./account-forms";
import type {SupportState,SupportTicket} from "@/lib/support/types";
export function SupportForm({id,name,email,facility,screenshotReady}:{id:string;name:string;email:string;facility:string;screenshotReady:boolean}) {
 const [nonce,setNonce]=useState(id);const ref=useRef<HTMLFormElement>(null);
 const [state,action,pending]=useActionState(async(previous:SupportState,form:FormData)=>{
  const result=await submitSupport(previous,form);
  if(result.success){ref.current?.reset();setNonce(crypto.randomUUID());}return result;
 },{});
 return <form action={action} ref={ref} className="account-form" aria-busy={pending}><fieldset disabled={pending}>
 <input type="hidden" name="ticket_id" value={nonce}/>
 <label>Contact name<input name="contact_name" required minLength={2} maxLength={120} autoComplete="name" defaultValue={name}/></label>
 <label>Contact email<input name="contact_email" type="email" required maxLength={254} autoComplete="email" defaultValue={email}/><small>Prefilled from your account; change it if you prefer another contact address.</small></label>
 <label>Phone (optional)<input name="contact_phone" type="tel" maxLength={40} autoComplete="tel"/></label>
 <label>Facility (optional)<input name="facility_name" maxLength={160} autoComplete="organization" defaultValue={facility}/></label>
 <label>Issue<textarea name="issue" required minLength={10} maxLength={5000} rows={6} placeholder="Describe the problem, the page you were using, and steps to reproduce it."/></label>
 <label>Screenshot (optional)<input name="screenshot" type="file" accept="image/jpeg,image/png,image/webp" disabled={!screenshotReady}/><small>One JPEG, PNG or WebP up to 5 MB. Redact patient information, passwords and API keys.</small></label>
 {!screenshotReady && <p className="notice">Screenshots are not configured yet. You can submit a text-only ticket.</p>}
 </fieldset>{state.error && <p className="error" role="alert">{state.error}{state.ticketId && <> Ticket reference: {state.ticketId}. Keep this form unchanged to retry the screenshot.</>}</p>}
 {state.success && <p className="notice" role="status">{state.success}</p>}
 <button className="button primary" type="submit" disabled={pending}>{pending ? "Submitting…" : "Submit support ticket"}</button>
 <p className="muted">Tickets are private to you and platform support administrators. No automatic support email is sent.</p>
 </form>;
}
export function SupportStatusForm({id,status}:{id:string;status:string}) {return <ActionForm action={updateSupportStatus} submit="Update status"><input type="hidden" name="ticket_id" value={id}/><label>Status<select name="status" defaultValue={status}><option value="open">Open</option><option value="in_progress">In progress</option><option value="closed">Closed</option></select></label></ActionForm>;}
export function SupportScreenshotRetry({ticket,ready}:{ticket:SupportTicket;ready:boolean}) {
 const [withinRetryWindow]=useState(()=>Date.now()-Date.parse(ticket.created_at)<=86400000);
 if(!ready || !withinRetryWindow) return <p className="muted">Screenshot retry requires configured uploads and a ticket created within the last 24 hours. The text ticket remains available.</p>;
 return <ActionForm action={submitSupport} submit="Retry screenshot upload"><input type="hidden" name="ticket_id" value={ticket.id}/>
 <input type="hidden" name="contact_name" value={ticket.contact_name}/><input type="hidden" name="contact_email" value={ticket.contact_email}/><input type="hidden" name="contact_phone" value={ticket.contact_phone}/><input type="hidden" name="facility_name" value={ticket.facility_name}/><input type="hidden" name="issue" value={ticket.issue}/>
 <label>Retry optional screenshot<input name="screenshot" type="file" required accept="image/jpeg,image/png,image/webp"/></label></ActionForm>;
}
