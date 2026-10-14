import { redirect } from "next/navigation";
import type { SearchParams } from "@/lib/inventory/types";
import { getAppMode } from "@/lib/app-mode";
import { authenticatedClient } from "@/lib/auth/server";
import { WelcomeLogin } from "@/components/account-pages";
export default async function Page({searchParams}:{searchParams:Promise<SearchParams>}) {
 const params=await searchParams;
 if(getAppMode()==="connected") {
  const {user}=await authenticatedClient();
  if(!user) {
   const kind=params.welcome;
   return <WelcomeLogin kind={kind === "register" || kind === "forgot" || kind === "resend" ? kind : "login"}/>;
  }
  if(!user.email_confirmed_at) redirect("/auth/login?notice=confirmation");
 }
 const query=new URLSearchParams();
 for(const [key,value] of Object.entries(params))if(key !== "welcome" && typeof value==='string')query.set(key,value);
 redirect(`/marketplace${query.size?`?${query}`:''}`);
}
