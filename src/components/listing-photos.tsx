"use client";
import { imageUploadSizeError, IMAGE_UPLOAD_LIMIT_LABEL } from "@/lib/upload-limits.mjs";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionForm } from "./account-forms";
import { Icon } from "./marketplace";
import { uploadPhoto,removePhoto,arrangePhotos } from "@/app/photo-actions";
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
export function PhotoManager({listingId,photos}: {listingId:string;photos:ListingPhoto[]}) {
  const ready=photos.filter(p=>p.state==='ready').sort((a,b)=>a.position-b.position);
  const [order,setOrder]=useState(ready.map(p=>p.id));const [cover,setCover]=useState(ready.find(p=>p.is_cover)?.id ?? ready[0]?.id);
  const ordered=order.map(id=>ready.find(p=>p.id===id)).filter((p):p is ListingPhoto=>!!p);
  function move(index:number,direction:number) {setOrder(previous=>{const next=[...previous];[next[index],next[index+direction]]=[next[index+direction],next[index]];return next;});}
  return <section className="panel form-panel"><h2>Listing photos</h2><p>Up to 6 photos, {IMAGE_UPLOAD_LIMIT_LABEL} each. JPEG, PNG or WebP; image content is decoded and sanitized. Save a new listing before adding photos.</p>
    <ActionForm action={uploadPhoto} submit="Upload photo"><input type="hidden" name="listing_id" value={listingId}/><label>Choose one photo<input name="photo" type="file" required accept="image/jpeg,image/png,image/webp" onChange={event=>{event.currentTarget.setCustomValidity(imageUploadSizeError(event.currentTarget.files?.[0]?.size ?? 0));event.currentTarget.reportValidity();}}/></label></ActionForm>
    {ready.length>0 && <ActionForm action={arrangePhotos} submit="Save order and cover"><input type="hidden" name="listing_id" value={listingId}/><input type="hidden" name="photo_ids" value={ordered.map(p=>p.id).join(",")}/><input type="hidden" name="cover_id" value={cover}/><div className="photo-manager-grid">{ordered.map((p,i)=><div key={p.id} className="photo-manager-item"><PhotoImage key={p.url} photo={p} alt={`Listing photo ${i+1}`}/><label><input type="radio" name="cover_selection" checked={cover===p.id} onChange={()=>setCover(p.id)}/> Cover photo</label><div className="manage-actions"><button className="button secondary" type="button" disabled={i===0} onClick={()=>move(i,-1)}>Earlier</button><button className="button secondary" type="button" disabled={i===ordered.length-1} onClick={()=>move(i,1)}>Later</button></div></div>)}</div></ActionForm>}
    {photos.length>0 && <div className="photo-removals"><h3>Remove a photo or unfinished upload</h3>{photos.map((p,i)=><ActionForm key={p.id} action={removePhoto} submit={`Remove ${p.state==='ready' ? `photo ${ready.findIndex(r=>r.id===p.id)+1}` : `${p.state} upload ${i+1}`}`} className="compact-action"><input type="hidden" name="listing_id" value={listingId}/><input type="hidden" name="photo_id" value={p.id}/></ActionForm>)}</div>}
    <p className="muted">If a failed upload remains listed, retry removal. Photo links expire after 60 seconds; refresh to renew them.</p>
  </section>;
}
