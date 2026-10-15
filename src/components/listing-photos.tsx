"use client";
import { IMAGE_UPLOAD_LIMIT_LABEL } from "@/lib/upload-limits.mjs";
import { CameraUpload } from "./camera-upload";
import Image from "next/image";
import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { ActionForm } from "./account-forms";
import { Icon } from "./marketplace";
import { removePhoto,arrangePhotos } from "@/app/photo-actions";
import type { ListingPhoto } from "@/lib/photos/server";
function PhotoImage({photo,large=false,alt}: {photo?:ListingPhoto;large?:boolean;alt:string}) {
  const [failed,setFailed]=useState(false);
  return <div className={`listing-photo ${large ? "large" : ""}`}>{photo?.url && !failed
    ? <Image src={photo.url} width={photo.width ?? 1200} height={photo.height ?? 900} alt={alt} unoptimized onError={()=>setFailed(true)}/>
    : <div className="photo-placeholder"><Icon name="box" size={40}/><span>{failed ? "Photo unavailable · refresh to renew the link" : "No photo provided"}</span></div>}</div>;
}
export function ListingVisual({photos,large=false,name}: {photos:ListingPhoto[];large?:boolean;name:string}) {
  const [selected,setSelected]=useState<string|undefined>(photos[0]?.id);
  const router=useRouter();const photo=photos.find(p=>p.id===selected) ?? photos[0];
  return <div className="photo-gallery"><PhotoImage key={photo?.url ?? "empty"} photo={photo} large={large} alt={name}/>{large && <><div className="photo-thumbnails">{photos.map((p,i)=><button key={p.id} type="button" className={p.id===photo?.id ? "selected" : ""} aria-label={`View photo ${i+1}`} aria-pressed={p.id===photo?.id} onClick={()=>setSelected(p.id)}><Image src={p.url!} width={80} height={65} alt={`Photo ${i+1}`} unoptimized/></button>)}</div><button className="button secondary" type="button" onClick={()=>router.refresh()}>Refresh photos</button></>}</div>;
}
export function PhotoManager({listingId,photos:initialPhotos}: {listingId:string;photos:ListingPhoto[]}) {
  const [photos,setPhotos]=useState(initialPhotos);
  const galleryDirty=useRef(false);
  const [refreshError,setRefreshError]=useState("");
  const [handoff,setHandoff]=useState<{url:string;qr:string}|null>(null);
  const [handoffError,setHandoffError]=useState("");
  const [linkBusy,setLinkBusy]=useState(false);
  const [copied,setCopied]=useState(false);
  const ready=photos.filter(p=>p.state==='ready').sort((a,b)=>a.position-b.position);
  const [order,setOrder]=useState(ready.map(p=>p.id));const [cover,setCover]=useState(ready.find(p=>p.is_cover)?.id ?? ready[0]?.id);
  const loadPhotos=useCallback(async()=>{
    try {const response=await fetch('/api/listings/'+listingId+'/photos',{cache:'no-store'});const body=await response.json();if(!response.ok)throw new Error(body.error||'Photos unavailable.');
      if(!Array.isArray(body.photos))throw new Error('Invalid photo response. Please refresh.');
      const next=body.photos as ListingPhoto[];setPhotos(next);setRefreshError('');
      const ids=next.filter(p=>p.state==='ready').sort((a,b)=>a.position-b.position).map(p=>p.id);
      setOrder(previous=>galleryDirty.current?[...previous.filter(id=>ids.includes(id)),...ids.filter(id=>!previous.includes(id))]:ids);
      setCover(previous=>galleryDirty.current&&previous&&ids.includes(previous)?previous:next.find(p=>p.is_cover)?.id??ids[0]);
    }catch(error){setRefreshError((error as Error).message);}
  },[listingId]);
  useEffect(()=>{const timer=setInterval(()=>{if(document.visibilityState==='visible')void loadPhotos();},20000);return()=>clearInterval(timer);},[loadPhotos]);
  async function openPhone(){setLinkBusy(true);setHandoffError('');setCopied(false);try{const response=await fetch('/api/listings/'+listingId+'/photos?handoff=1',{cache:'no-store'});const body=await response.json();if(!response.ok)throw new Error(body.error||'Phone link unavailable.');setHandoff(body);}catch(error){setHandoffError((error as Error).message);}finally{setLinkBusy(false);}}
  const ordered=order.map(id=>ready.find(p=>p.id===id)).filter((p):p is ListingPhoto=>!!p);
  function move(index:number,direction:number) {galleryDirty.current=true;setOrder(previous=>{const next=[...previous];[next[index],next[index+direction]]=[next[index+direction],next[index]];return next;});}
  return <section className="panel form-panel"><h2>Listing photos</h2><p>Up to 6 photos, {IMAGE_UPLOAD_LIMIT_LABEL} each. JPEG, PNG or WebP; image content is decoded and sanitized. Photos remain private while this listing is a draft.</p>
    <CameraUpload listingId={listingId} uploaded={loadPhotos} disabled={photos.filter(p=>p.state!=='deleting').length>=6}/>
    {photos.filter(p=>p.state!=='deleting').length>=6 && <p className="notice">All six photo slots are in use. Remove a photo or unfinished upload to add another.</p>}
    <div className="manage-actions"><button className="button secondary" type="button" disabled={linkBusy} onClick={()=>void openPhone()}>{linkBusy?'Preparing link...':'Upload from phone'}</button><button className="button secondary" type="button" onClick={()=>void loadPhotos()}>Refresh photos</button></div>
    {refreshError && <p className="error" role="alert">{refreshError} Your listing edits have been kept. Sign in again if your session expired, then refresh photos.</p>}
    {handoffError && <p className="error" role="alert">{handoffError}</p>}
    {handoff && <section className="phone-handoff" aria-label="Upload from phone"><h3>Scan with your phone camera</h3><Image src={handoff.qr} alt="QR code for this listing's authenticated photo page" width={256} height={256} unoptimized/><p>Sign in on your phone as an approved owner or inventory editor for this listing&apos;s facility. Keep this page open; new photos appear within 20 seconds without replacing your listing edits.</p><label>Phone upload link<input readOnly value={handoff.url} onFocus={e=>e.currentTarget.select()}/></label><div className="manage-actions"><button className="button secondary" type="button" onClick={async()=>{try{await navigator.clipboard.writeText(handoff.url);setCopied(true);}catch{setHandoffError('Select and copy the phone link above.');}}}>{copied?'Copied':'Copy link'}</button><a className="button secondary" href={handoff.url} target="_blank" rel="noopener noreferrer">Open phone page</a><button className="button secondary" type="button" onClick={()=>setHandoff(null)}>Close</button></div><p>This link grants no permissions and can only be used with an eligible signed-in account. No email or text message is sent.</p></section>}

    {ready.length>0 && <ActionForm action={async(state,form)=>{const result=await arrangePhotos(state,form);if(result.success){galleryDirty.current=false;await loadPhotos();}return result;}} submit="Save order and cover"><input type="hidden" name="listing_id" value={listingId}/><input type="hidden" name="photo_ids" value={ordered.map(p=>p.id).join(",")}/><input type="hidden" name="cover_id" value={cover}/><div className="photo-manager-grid">{ordered.map((p,i)=><div key={p.id} className="photo-manager-item"><PhotoImage key={p.url} photo={p} alt={`Listing photo ${i+1}`}/><label><input type="radio" name="cover_selection" checked={cover===p.id} onChange={()=>{galleryDirty.current=true;setCover(p.id);}}/> Cover photo</label><div className="manage-actions"><button className="button secondary" type="button" disabled={i===0} onClick={()=>move(i,-1)}>Earlier</button><button className="button secondary" type="button" disabled={i===ordered.length-1} onClick={()=>move(i,1)}>Later</button></div></div>)}</div></ActionForm>}
    {photos.length>0 && <div className="photo-removals"><h3>Remove a photo or unfinished upload</h3>{photos.map((p,i)=><ActionForm key={p.id} action={async(state,form)=>{const result=await removePhoto(state,form);if(result.success)await loadPhotos();return result;}} submit={`Remove ${p.state==='ready' ? `photo ${ready.findIndex(r=>r.id===p.id)+1}` : `${p.state} upload ${i+1}`}`} className="compact-action"><input type="hidden" name="listing_id" value={listingId}/><input type="hidden" name="photo_id" value={p.id}/></ActionForm>)}</div>}
    <p className="muted">If a failed upload remains listed, retry removal. Photo links expire after 60 seconds; refresh to renew them.</p>
  </section>;
}
