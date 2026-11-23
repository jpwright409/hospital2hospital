"use client";
export default function Error({reset}:{reset:()=>void}){return <div className="container page-section"><h1>Offers unavailable</h1><p>Check your account and facility access, then retry.</p><button className="button secondary" onClick={reset}>Try again</button></div>;}
