"use client";
import Link from "next/link";
import {useEffect,useId,useRef,useState} from "react";
import {usePathname} from "next/navigation";
const links=[['/faq','FAQ'],['/about','About'],['/cost-savings','Cost Savings'],['/our-partners','Our Partners'],['/refer','Refer a facility'],['/watchlist','Watchlists'],['/help','Get Help']];
export function FindMenu() {
 const [open,setOpen]=useState(false);const id=useId();const ref=useRef<HTMLDivElement>(null);const button=useRef<HTMLButtonElement>(null);
 const path=usePathname();const [access,setAccess]=useState({path:"",allowed:false});
 useEffect(()=>{
  let stopped=false;let request:AbortController|null=null;
  async function refresh(){
   request?.abort();const current=new AbortController();request=current;
   try{const response=await fetch("/api/facilitator-access",{cache:"no-store",signal:current.signal});const result=await response.json();if(!stopped&&!current.signal.aborted)setAccess({path,allowed:response.ok&&result.isPlatformAdministrator===true});}
   catch{if(!stopped&&!current.signal.aborted)setAccess({path,allowed:false});}
  }
  const visible=()=>{if(document.visibilityState==="visible")void refresh();};
  void refresh();window.addEventListener("focus",visible);document.addEventListener("visibilitychange",visible);
  return()=>{stopped=true;request?.abort();window.removeEventListener("focus",visible);document.removeEventListener("visibilitychange",visible);};
 },[path]);
 const visibleLinks=access.path===path&&access.allowed?[...links,["/admin","Facilitator Dashboard"]]:links;
 return <div ref={ref} className="find-menu" onPointerEnter={e=>{if(e.pointerType==='mouse')setOpen(true);}} onPointerLeave={e=>{if(e.pointerType==='mouse' && !ref.current?.contains(document.activeElement))setOpen(false);}}
 onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false);}}
 onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);button.current?.focus();}if(e.key==='ArrowDown' && e.target===button.current){e.preventDefault();setOpen(true);requestAnimationFrame(()=>ref.current?.querySelector('a')?.focus());}}}>
 <button ref={button} className="find-trigger" type="button" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(v=>!v)}>Find <span aria-hidden="true">▾</span></button>
 <div id={id} className="find-links" hidden={!open}>{visibleLinks.map(([href,label])=><Link key={href} href={href} onClick={()=>setOpen(false)}>{label}</Link>)}</div>
 </div>;
}
