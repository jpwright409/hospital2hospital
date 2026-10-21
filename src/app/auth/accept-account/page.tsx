"use client";
import Link from "next/link";
import {useEffect,useRef,useState} from "react";
import {createClient} from "@/lib/supabase/browser";

export default function Page(){
 const started=useRef(false);const [state,setState]=useState<{email?:string;error?:string}>({});
 useEffect(()=>{
  if(started.current)return;started.current=true;
  const hash=new URLSearchParams(window.location.hash.slice(1)),query=new URLSearchParams(window.location.search);
  // Capture credentials once, then remove them from the visible URL/history.
  window.history.replaceState(null,"","/auth/accept-account");
  void(async()=>{try{
   const client=createClient();const type=query.get("type")??hash.get("type"),token=query.get("token_hash");
   if(type!=="invite"&&type!=="recovery")throw new Error("invalid");
   if(token){const result=await client.auth.verifyOtp({token_hash:token,type});if(result.error)throw result.error;}
   else{const access=hash.get("access_token"),refresh=hash.get("refresh_token");if(!access||!refresh||access.length>16000||refresh.length>16000)throw new Error("invalid");const result=await client.auth.setSession({access_token:access,refresh_token:refresh});if(result.error)throw result.error;}
   const result=await client.auth.getUser();if(result.error||!result.data.user?.email_confirmed_at||!result.data.user.email)throw new Error("invalid");
   setState({email:result.data.user.email});
  }catch{setState({error:"This invitation or recovery link is invalid, expired or already used. Request a fresh link or contact your administrator."});}})();
 },[]);
 return <div className="container page-section auth-container"><section className="panel"><h1>Set up your account password</h1>{state.error?<><p className="error" role="alert">{state.error}</p><Link className="button secondary" href="/auth/forgot-password">Request recovery link</Link></>:state.email?<><p>Verified account: <strong>{state.email}</strong></p><p>Continue to choose your own password. Account creation does not grant facility membership or platform administrator access.</p><Link className="button primary" href="/auth/update-password">Set password</Link></>:<p role="status">Verifying your email link…</p>}</section></div>;
}
