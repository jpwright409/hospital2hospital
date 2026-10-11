"use client";
import { useRef,useState } from "react";
import { ActionForm } from "./account-forms";
import { saveWatchlist,deleteWatchlist,referFacility } from "@/app/community-actions";
import { procedures } from "@/lib/inventory/types";
export type Watchlist={id:string;name:string;criteria:Record<string,string>;enabled:boolean;email_enabled:boolean};
export function WatchlistForm({watch,manufacturers,emailReady,existing=false}:{watch:Watchlist;manufacturers:{id:string;name:string}[];emailReady:boolean;existing?:boolean}) {
 return <ActionForm action={saveWatchlist} submit={existing ? "Update watchlist" : "Create watchlist"}>
 <input type="hidden" name="id" value={watch.id}/><input type="hidden" name="existing" value={existing ? "yes" : "no"}/>
 <label>Watchlist name<input name="name" required minLength={2} maxLength={120} defaultValue={watch.name}/></label>
 <div className="form-grid"><label>Search words<input name="q" maxLength={200} defaultValue={watch.criteria.q}/></label>
 <label>Exact catalog / SKU<input name="catalog_number" maxLength={100} defaultValue={watch.criteria.catalog_number}/></label>
 <label>Manufacturer<select name="manufacturer" defaultValue={watch.criteria.manufacturer??""}><option value="">Any manufacturer</option>{manufacturers.map(m=><option key={m.id} value={m.name}>{m.name}</option>)}</select></label>
 <label>Procedure<select name="procedure_type" defaultValue={watch.criteria.procedure_type??""}><option value="">Any procedure</option>{procedures.map(p=><option key={p}>{p}</option>)}</select></label>
 <label>Product type<select name="product_kind" defaultValue={watch.criteria.product_kind??""}><option value="">Any type</option><option value="capital">Capital equipment</option><option value="disposable">Disposable</option></select></label></div>
 <div className="watchlist-options">
 <label><input name="enabled" type="checkbox" value="yes" defaultChecked={watch.enabled}/> Watch for new listings</label>
 <label><input name="email_enabled" type="checkbox" value="yes" disabled={!emailReady} defaultChecked={emailReady && watch.email_enabled}/> Email me when a new listing matches</label>
 </div>
 {!emailReady && <p className="notice">Email delivery is not configured. You can still maintain watchlists and review matches here.</p>}
 </ActionForm>;
}
export function RemoveWatchlist({id}:{id:string}) {return <ActionForm action={deleteWatchlist} submit="Remove watchlist" className="compact-action"><input type="hidden" name="id" value={id}/></ActionForm>;}
export function ReferralForm({id,facilityName,facilityId,emailReady}:{id:string;facilityName:string;facilityId:string;emailReady:boolean}) {
 const [nonce,setNonce]=useState(id);const ref=useRef<HTMLInputElement>(null);
 return <ActionForm action={async(state,form)=>{const result=await referFacility(state,form);if(result.success){if(ref.current)ref.current.value="";setNonce(crypto.randomUUID());}return result;}} submit="Queue invitation email"><input type="hidden" name="id" value={nonce}/><input type="hidden" name="facility_id" value={facilityId}/><p>Your name and {facilityName} will be included in the invitation.</p><label>Friend&apos;s work email<input ref={ref} name="email" type="email" required maxLength={254} disabled={!emailReady}/></label><p>The invitation links to registration; it does not enroll anyone automatically or attach them to your facility.</p>{!emailReady && <p className="notice">Referral email delivery is not configured yet. The platform operator must enable the provider and delivery worker.</p>}</ActionForm>;
}
