"use client";
import { useActionState, useEffect, useRef, useState } from "react";
import { ActionForm } from "./account-forms";
import { saveInventory, changeInventoryStatus, changeSavedListing, deleteInventory } from "@/app/inventory-actions";
import { conditions, quantityUnits, procedures, type CatalogProduct, type InventoryListing } from "@/lib/inventory/types";
export function SavedAction({id,saved}: {id: string; saved: boolean}) {
  return <ActionForm action={changeSavedListing} submit={saved ? "Remove saved listing" : "Save listing"} className="compact-action">
    <input type="hidden" name="listing_id" value={id}/><input type="hidden" name="remove" value={saved ? "yes" : "no"}/>
  </ActionForm>;
}
export function StatusAction({listing,status}: {listing: InventoryListing; status: string}) {
  return <ActionForm action={changeInventoryStatus} submit={status === "active" ? "Reactivate" : status === "sold" ? "Mark sold" : "Deactivate"} className="compact-action">
    <input type="hidden" name="listing_id" value={listing.id}/><input type="hidden" name="revision" value={listing.revision}/><input type="hidden" name="status" value={status}/>
  </ActionForm>;
}
export function InventoryEditor({listing,product,manufacturers=[]}: {listing?: InventoryListing; product?: CatalogProduct; manufacturers?:{id:string;name:string}[]}) {
  const reference = listing ?? product;
  return <ActionForm action={saveInventory} submit={listing ? "Save changes" : "Create listing"}>
    {listing && <><input type="hidden" name="listing_id" value={listing.id}/><input type="hidden" name="revision" value={listing.revision}/></>}
    {reference && <input type="hidden" name="product_id" value={listing?.product_id ?? product?.id}/>}
    <section className="panel form-panel"><h2>Identify the product</h2>
      {reference ? <><p className="notice">Shared reference information cannot be edited by sellers.</p><h3>{reference.name}</h3><p>{reference.manufacturer} · {reference.catalog_number} · {reference.category}</p></> :
        <><p>Propose a reference product. If the manufacturer and catalog number already exist, that product is reused without changes.</p><div className="form-grid">
          <label>Manufacturer *<input name="manufacturer" list="manufacturer-options" required minLength={2} maxLength={120}/><datalist id="manufacturer-options">{manufacturers.map(m=><option key={m.id} value={m.name}/>)}</datalist><small>Select a manufacturer or enter a new one.</small></label>
          <label>Catalog / SKU number *<input name="catalog_number" required maxLength={100}/></label>
          <label className="full">Product name *<input name="name" required minLength={2} maxLength={180}/></label>
          <label>Category *<input name="category" required minLength={2} maxLength={100} list="listing-categories"/><datalist id="listing-categories">{["General Surgery","Orthopedics","Cardiovascular","ENT","Wound Care","Surgical Equipment"].map(c => <option key={c} value={c}/>)}</datalist></label>
          <label className="full">Product description<textarea name="description" maxLength={4000}/></label>
        </div></>}
    </section>
    <section className="panel form-panel"><h2>Your facility’s inventory</h2><p>Price is in USD per selected quantity unit. Package size describes individual items inside each unit.</p><div className="form-grid">
      <label>Inventory type *<select name="inventory_kind" required defaultValue={listing?.inventory_kind === "unclassified" ? "" : listing?.inventory_kind ?? product?.product_kind ?? ""}><option value="" disabled>Choose a type</option><option value="capital">Capital equipment</option><option value="disposable">Disposable supplies</option></select><small>Your listing classification does not overwrite shared catalog records.</small></label><label>Quantity available *<input name="quantity" type="number" required min={1} max={100000000} step={1} defaultValue={listing?.quantity}/></label>
      <label>Quantity unit *<select name="quantity_unit" defaultValue={listing?.quantity_unit ?? "each"}>{quantityUnits.map(u => <option key={u}>{u}</option>)}</select></label>
      <label>Items per package/unit *<input name="units_per_package" type="number" required min={1} max={1000000} step={1} defaultValue={listing?.units_per_package ?? 1}/><small>Use 1 for “each”. For a box/case/pack, enter the number of individual items.</small></label>
      <label>Asking price per quantity unit (USD) *<input name="price_usd" type="number" required min={0} max={9999999999.99} step="0.01" defaultValue={listing?.price_usd}/><small>Use 0 if there is no minimum asking price; mark Negotiable to discuss offers.</small></label>
      <label><input type="checkbox" name="price_negotiable" value="yes" defaultChecked={listing?.price_negotiable}/> Price negotiable / open to offers</label><label>Procedure type<select name="procedure_type" defaultValue={listing?.procedure_type ?? "Other"}>{procedures.map(p=><option key={p}>{p}</option>)}</select></label><label>Condition *<select name="condition" defaultValue={listing?.condition ?? conditions[0]}>{conditions.map(c => <option key={c}>{c}</option>)}</select></label>
      <label>Expiration (optional)<input name="expiration" type="date" defaultValue={listing?.expiration ?? ""}/></label>
      <label>Sterile status<select name="sterile" defaultValue={listing?.sterile ? "yes" : "no"}><option value="yes">Sterile</option><option value="no">Non-sterile</option></select></label>
      <label>Use type<select name="single_use" defaultValue={listing?.single_use === false ? "no" : "yes"}><option value="yes">Single-use</option><option value="no">Reusable</option></select></label>
      <label>Packaging<input name="packaging" maxLength={200} defaultValue={listing?.packaging}/></label>
      <label>Status<select name="status" defaultValue={listing?.status ?? "active"}><option value="active">Active · public inventory</option><option value="inactive">Inactive · facility only</option>{listing && <option value="sold">Sold · facility only</option>}</select></label>
      <label className="full">Seller notes<textarea name="notes" maxLength={2000} defaultValue={listing?.notes}/><small>Public listing text: do not include personal contact information.</small></label>
    </div></section><p className="notice">Save your listing, then add photos from its edit page. Verify actual stock before publishing or reactivating.</p>
  </ActionForm>;
}

function DeleteConfirmation({listing,close,setPending}:{listing:InventoryListing;close:()=>void;setPending:(pending:boolean)=>void}) {
 const [confirmed,setConfirmed]=useState(false);
 const cancel=useRef<HTMLButtonElement>(null);
 const [state,action,pending]=useActionState(async(previous:{error?:string;success?:string},form:FormData)=>{
  setPending(true);
  try {const result=await deleteInventory(previous,form);if(result.success)close();return result;}
  finally {setPending(false);}
 },{});
 useEffect(()=>{cancel.current?.focus();},[]);
 return <form action={action} aria-busy={pending}>
  <h2>Are you sure you wish to delete this listing?</h2>
  <p className="delete-confirm-product">{listing.name}</p>
  <p>This listing cannot be reactivated after deletion. Deactivate it instead if you may list it again.</p>
  <input type="hidden" name="listing_id" value={listing.id}/><input type="hidden" name="revision" value={listing.revision}/>
  <label className="delete-confirm-check"><input type="checkbox" name="confirm" value="yes" required checked={confirmed} disabled={pending} onChange={e=>setConfirmed(e.target.checked)}/> yes, delete the listing</label>
  {state.error && <p className="error" role="alert">{state.error}</p>}
  <div className="delete-confirm-buttons"><button className="button delete-listing-trigger" type="submit" disabled={!confirmed || pending}>{pending ? "Deleting…" : "Delete listing"}</button><button ref={cancel} className="button secondary" type="button" disabled={pending} onClick={close}>Cancel</button></div>
 </form>;
}
export function DeleteAction({listing}:{listing:InventoryListing}) {
 const dialog=useRef<HTMLDialogElement>(null);const [session,setSession]=useState(0);const pending=useRef(false);
 return <div className="delete-listing-action"><button type="button" className="button delete-listing-trigger" onClick={()=>{setSession(s=>s+1);dialog.current?.showModal();}}>Delete listing</button>
 <dialog ref={dialog} className="delete-confirm-dialog" aria-label="Confirm listing deletion" onCancel={e=>{if(pending.current)e.preventDefault();}}>
  <DeleteConfirmation key={session} listing={listing} close={()=>dialog.current?.close()} setPending={value=>{pending.current=value;}}/>
 </dialog></div>;
}
