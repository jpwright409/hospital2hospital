"use client";
import Image from "next/image";
import Link from "next/link";
import {useEffect,useRef,useState} from "react";
import {uploadPhoto} from "@/app/photo-actions";
import {prepareCameraPhoto} from "@/lib/photos/prepare";

export function CameraUpload({listingId,uploaded,disabled=false,onBusyChange}:{listingId:string;uploaded:()=>Promise<void>;disabled?:boolean;onBusyChange?:(busy:boolean)=>void}) {
  const requestId=useRef<string>("");
  const camera=useRef<HTMLInputElement>(null),gallery=useRef<HTMLInputElement>(null);
  const [photo,setPhoto]=useState<File|null>(null),[preview,setPreview]=useState<string|null>(null);
  const previewRef=useRef<string|null>(null);
  function replacePhoto(next:File|null){if(previewRef.current)URL.revokeObjectURL(previewRef.current);const url=next?URL.createObjectURL(next):null;previewRef.current=url;setPhoto(next);setPreview(url);}
  const [busy,setBusy]=useState(""),[error,setError]=useState(""),[success,setSuccess]=useState("");
  useEffect(()=>{onBusyChange?.(!!busy||!!photo);},[busy,photo,onBusyChange]);
  useEffect(()=>()=>{if(previewRef.current)URL.revokeObjectURL(previewRef.current);},[]);
  async function choose(file?:File){if(!file)return;setBusy("Preparing photo...");setError("");setSuccess("");replacePhoto(null);try{replacePhoto(await prepareCameraPhoto(file));requestId.current=crypto.randomUUID();}catch(e){setError((e as Error).message);}finally{setBusy("");}}
  async function send(){if(!photo||busy)return;setBusy("Uploading photo...");setError("");setSuccess("");try{const form=new FormData();form.set("listing_id",listingId);form.set("photo",photo);form.set("photo_request_id",requestId.current);const result=await uploadPhoto({},form);if(result.error)throw new Error(result.error);replacePhoto(null);setSuccess("Photo uploaded.");await uploaded();}catch(e){setError((e as Error).message);}finally{setBusy("");}}
  return <div className="camera-upload" aria-busy={!!busy}>
    <p>Take a photo or choose one to preview. Photos are resized on this device before upload (3 MB maximum sent). JPEG, PNG or WebP; originals up to 20 MB and 20 megapixels. Camera availability depends on your device.</p>
    <input ref={camera} className="sr-only" type="file" tabIndex={-1} aria-label="Take a listing photo" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={!!busy||disabled} onChange={e=>{void choose(e.target.files?.[0]);e.target.value="";}}/>
    <input ref={gallery} className="sr-only" type="file" tabIndex={-1} aria-label="Choose a listing photo" accept="image/jpeg,image/png,image/webp" disabled={!!busy||disabled} onChange={e=>{void choose(e.target.files?.[0]);e.target.value="";}}/>
    <div className="manage-actions"><button className="button primary" type="button" disabled={!!busy||disabled} onClick={()=>camera.current?.click()}>Take a photo</button><button className="button secondary" type="button" disabled={!!busy||disabled} onClick={()=>gallery.current?.click()}>Choose existing photo</button></div>
    {preview && <div className="camera-preview"><Image src={preview} alt="Photo preview before upload" width={400} height={300} unoptimized/><p>Prepared size: {(photo!.size/1_000_000).toFixed(2)} MB</p><div className="manage-actions"><button className="button primary" type="button" disabled={!!busy||disabled} onClick={()=>void send()}>Upload this photo</button><button className="button secondary" type="button" disabled={!!busy} onClick={()=>replacePhoto(null)}>Cancel photo</button></div></div>}
    {busy && <p role="status">{busy}</p>}{error && <p className="error" role="alert">{error} <Link href={`/auth/login?next=${encodeURIComponent(`/listings/${listingId}/photos`)}`} target="_blank" rel="noopener noreferrer">Sign in again in a new tab</Link></p>}{success && <p className="notice" role="status">{success}</p>}
  </div>;
}
