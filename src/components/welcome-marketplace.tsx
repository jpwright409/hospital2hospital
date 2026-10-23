"use client";
import Image from "next/image";
import Link from "next/link";
import {useEffect,useRef,useState} from "react";

export type PreviewListing={id:string;name:string;manufacturer:string;catalogNumber:string;priceUsd:number;quantityUnit:string;negotiable:boolean;facilityName:string;location:string;photoUrl:string|null};
function PreviewPhoto({listing}:{listing:PreviewListing}){
 const [failed,setFailed]=useState(false);
 return <div className="welcome-preview-photo">{listing.photoUrl&&!failed?<Image src={listing.photoUrl} alt="" width={420} height={260} unoptimized onError={()=>setFailed(true)}/>:<div className="welcome-preview-placeholder"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10"/></svg><span>{failed?"Photo unavailable":"No photo provided"}</span></div>}</div>;
}

export function WelcomeMarketplace(){
 const [items,setItems]=useState<PreviewListing[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(false),[paused,setPaused]=useState(false),[reduced,setReduced]=useState(true),[retry,setRetry]=useState(0);
 const rail=useRef<HTMLDivElement>(null),interacting=useRef(false);
 useEffect(()=>{
  const media=matchMedia('(prefers-reduced-motion: reduce)');const update=()=>setReduced(media.matches);update();media.addEventListener('change',update);return()=>media.removeEventListener('change',update);
 },[]);
 useEffect(()=>{
  let stopped=false;let request:AbortController|null=null;
  async function refresh(){
   if(document.visibilityState!=='visible'||rail.current?.contains(document.activeElement))return;
   request?.abort();const current=new AbortController();request=current;
   try{
    const response=await fetch('/api/public-listing-preview',{cache:'no-store',signal:current.signal});const data=await response.json();
    if(!response.ok||!Array.isArray(data.items))throw new Error('Unavailable');
    if(!stopped&&!current.signal.aborted){setItems(data.items);setError(false);}
   }catch{if(!stopped&&!current.signal.aborted){setItems([]);setError(true);}}
   finally{if(!stopped&&!current.signal.aborted)setLoading(false);}
  }
  void refresh();const timer=setInterval(()=>void refresh(),45000);const visible=()=>{if(document.visibilityState==='visible')void refresh();};document.addEventListener('visibilitychange',visible);
  return()=>{stopped=true;request?.abort();clearInterval(timer);document.removeEventListener('visibilitychange',visible);};
 },[retry]);
 useEffect(()=>{
  if(paused||reduced||items.length<2)return;
  let frame:number,last=0,position=rail.current?.scrollLeft??0;
  function advance(time:number){
   const element=rail.current;
   if(element&&document.visibilityState==='visible'&&!interacting.current&&!element.contains(document.activeElement)){
    const delta=last?Math.min(time-last,60):0;
    if(element.scrollWidth>element.clientWidth){position=position>=element.scrollWidth-element.clientWidth-1?0:position+delta*0.022;element.scrollLeft=position;}
   }else if(element)position=element.scrollLeft;
   last=time;frame=requestAnimationFrame(advance);
  }
  frame=requestAnimationFrame(advance);return()=>cancelAnimationFrame(frame);
 },[paused,reduced,items.length]);
 return <div className="welcome-showcase" id="what-is-h2h">
  <p className="welcome-mission">Hospital2Hospital connects hospitals and surgery centers to share surplus surgical supplies and equipment, reduce waste, and lower costs.</p>
  <section className="welcome-listings" aria-labelledby="welcome-listings-title">
   <div className="welcome-section-heading"><h2 id="welcome-listings-title">A look inside the marketplace</h2>{items.length>1&&!reduced&&<button className="button secondary" type="button" onClick={()=>setPaused(v=>!v)} aria-pressed={paused}>{paused?'Resume scrolling':'Pause scrolling'}</button>}</div>
   {loading?<p className="welcome-preview-state" role="status">Loading marketplace listings…</p>:error?<div className="welcome-preview-state" role="status"><p>Listing previews are temporarily unavailable.</p><button type="button" className="button secondary" onClick={()=>{setLoading(true);setRetry(v=>v+1);}}>Try again</button></div>:!items.length?<p className="welcome-preview-state">New listings will appear here as approved facilities share inventory.</p>:<>
    <p className="welcome-scroll-hint">Scroll to explore current listings. Sign in to save items and connect with facilities.</p>
    <div className="welcome-listing-rail" ref={rail} role="region" aria-label="Current marketplace listings; scroll horizontally to explore" tabIndex={0} onMouseEnter={()=>{interacting.current=true;}} onMouseLeave={()=>{interacting.current=false;}} onPointerDown={()=>setPaused(true)} onWheel={()=>setPaused(true)}>
     {items.map(item=><article className="welcome-preview-card" key={item.id}><Link href={`/listings/${item.id}`} prefetch={false}><PreviewPhoto key={item.photoUrl??'no-photo'} listing={item}/><div className="welcome-preview-copy"><p className="welcome-preview-maker">{item.manufacturer}</p><h3>{item.name}</h3><p className="welcome-preview-catalog">CAT # {item.catalogNumber}</p><p className="welcome-preview-price">{new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(item.priceUsd)} <span>/ {item.quantityUnit}{item.negotiable?' · Negotiable':''}</span></p><p className="welcome-preview-facility">{item.facilityName}<span>{item.location}</span></p></div></Link></article>)}
    </div>
   </>}
  </section>
  <section className="welcome-overview" aria-labelledby="welcome-overview-title"><h2 id="welcome-overview-title">A better connection for your facility</h2><p>Hospital2Hospital is a free, facility-to-facility marketplace for excess surgical supplies and equipment. Find inventory from approved facilities, give surplus supplies a second life, and coordinate directly through private facility conversations.</p><nav aria-label="Explore Hospital2Hospital resources"><Link href="/cost-savings">Cost Savings</Link><Link href="/our-partners#dme-partners">DME Partners</Link><Link href="/our-partners#charity-partners">Charity Partners</Link></nav><Link className="button primary welcome-get-started" href="https://www.hospital2hospital.com/?welcome=register">Ready to Get Started?</Link></section>
 </div>;
}
