"use client";
import Link from "next/link";
import {useId,useRef,useState} from "react";
const links=[['/faq','FAQ'],['/about','About'],['/refer','Refer a facility'],['/watchlist','Watchlists'],['/help','Get Help']];
export function FindMenu() {
 const [open,setOpen]=useState(false);const id=useId();const ref=useRef<HTMLDivElement>(null);const button=useRef<HTMLButtonElement>(null);
 return <div ref={ref} className="find-menu" onPointerEnter={e=>{if(e.pointerType==='mouse')setOpen(true);}} onPointerLeave={e=>{if(e.pointerType==='mouse' && !ref.current?.contains(document.activeElement))setOpen(false);}}
 onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget))setOpen(false);}}
 onKeyDown={e=>{if(e.key==='Escape'){setOpen(false);button.current?.focus();}if(e.key==='ArrowDown' && e.target===button.current){e.preventDefault();setOpen(true);requestAnimationFrame(()=>ref.current?.querySelector('a')?.focus());}}}>
 <button ref={button} className="find-trigger" type="button" aria-expanded={open} aria-controls={id} onClick={()=>setOpen(v=>!v)}>Find <span aria-hidden="true">▾</span></button>
 <div id={id} className="find-links" hidden={!open}>{links.map(([href,label])=><Link key={href} href={href} onClick={()=>setOpen(false)}>{label}</Link>)}</div>
 </div>;
}
