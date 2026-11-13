import { redirect } from "next/navigation";
import type { SearchParams } from "@/lib/inventory/types";
import { getAppMode } from "@/lib/app-mode";
import { authenticatedClient } from "@/lib/auth/server";
import { WelcomeLogin } from "@/components/account-pages";
import { WelcomeMarketplace } from "@/components/welcome-marketplace";
import { WelcomeLanding } from "@/components/welcome-landing";
export default async function Page({searchParams}:{searchParams:Promise<SearchParams>}) {
 const params=await searchParams;
 if(getAppMode()==="connected") {
  const {user}=await authenticatedClient();
  if(!user) {
   const kind=params.welcome;
   if(kind === "login" || kind === "register" || kind === "forgot" || kind === "resend") return <WelcomeLogin kind={kind}/>;
   return <><WelcomeLanding/><WelcomeMarketplace/></>;
  }
  if(!user.email_confirmed_at) redirect("/auth/login?notice=confirmation");
 }
 const query=new URLSearchParams();
 for(const [key,value] of Object.entries(params))if(key !== "welcome" && typeof value==='string')query.set(key,value);
 redirect(`/marketplace${query.size?`?${query}`:''}`);
}
