"use client";
import { useActionState,useRef,useState,useEffect,useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionForm } from "./account-forms";
import { contactSeller,replyToConversation,markConversationRead } from "@/app/conversation-actions";
import type { InventoryState } from "@/lib/inventory/types";
export function RefreshConversation({label="Refresh messages"}: {label?:string}) {
  const router=useRouter();const [pending,startTransition]=useTransition();
  return <button className="button secondary" disabled={pending} type="button" onClick={()=>{window.dispatchEvent(new Event("h2h-messages-updated"));startTransition(()=>router.refresh());}}>{pending ? "Refreshing…" : label}</button>;
}
export function ContactForm({listingId,requestId,facilityName,facilityId}: {listingId:string;requestId:string;facilityName:string;facilityId:string}) {
  return <ActionForm action={contactSeller} submit="Contact Seller"><input type="hidden" name="facility_id" value={facilityId}/><input type="hidden" name="listing_id" value={listingId}/><input type="hidden" name="request_id" value={requestId}/><p>Sending from {facilityName}. Your message is private to the two participant facilities.</p><label>Message<textarea name="body" required minLength={1} maxLength={4000} placeholder="Ask about availability or product details."/></label></ActionForm>;
}
export function ReplyForm({id,requestId,facilityName,facilityId}: {id:string;requestId:string;facilityName:string;facilityId:string}) {
  const ref=useRef<HTMLFormElement>(null);const [nonce,setNonce]=useState(requestId);
  const [state,action,pending]=useActionState(async(previous:InventoryState,form:FormData)=>{
    const next=await replyToConversation(previous,form);
    if(next.success) {ref.current?.reset();setNonce(crypto.randomUUID());window.dispatchEvent(new Event("h2h-messages-updated"));}
    return next;
  },{});
  return <form ref={ref} action={action} className="account-form" aria-busy={pending}><fieldset disabled={pending}><input type="hidden" name="facility_id" value={facilityId}/><input type="hidden" name="conversation_id" value={id}/><input type="hidden" name="request_id" value={nonce}/><label>Reply as {facilityName}<textarea name="body" required minLength={1} maxLength={4000}/></label></fieldset>{state.error && <p className="error" role="alert">{state.error}</p>}{state.success && <p className="notice" role="status">{state.success}</p>}<button className="button primary" disabled={pending}>{pending ? "Sending…" : "Send reply"}</button></form>;
}
export function ReadReceipt({id,sequence}: {id:string;sequence:number}) {
  const [error,setError]=useState("");
  useEffect(()=>{
    let stopped=false;const form=new FormData();form.set("conversation_id",id);form.set("sequence",String(sequence));
    void markConversationRead({},form).then(result=>{if(!stopped){setError(result.error ?? "");if(!result.error)window.dispatchEvent(new Event("h2h-messages-updated"));}}).catch(()=>{if(!stopped)setError("Read status could not be updated. Refresh and retry.");});
    return ()=>{stopped=true;};
  },[id,sequence]);
  return error ? <p className="error" role="alert">{error}</p> : null;
}
