import { redirect } from "next/navigation";
import type { SearchParams } from "@/lib/inventory/types";
import { getAppMode } from "@/lib/app-mode";
import { authenticatedClient } from "@/lib/auth/server";
import { WelcomeLogin } from "@/components/account-pages";
export default async function Page({searchParams}:{searchParams:Promise<SearchParams>}) {
 if(getAppMode()==="connected") {
  const {user}=await authenticatedClient();
  if(!user) return <WelcomeLogin/>;
  if(!user.email_confirmed_at) redirect("/auth/login?notice=confirmation");
 }
 const params=await searchParams;const query=new URLSearchParams();
 for(const [key,value] of Object.entries(params))if(typeof value==='string')query.set(key,value);
 redirect(`/marketplace${query.size?`?${query}`:''}`);
}
