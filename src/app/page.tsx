import { redirect } from "next/navigation";
import type { SearchParams } from "@/lib/inventory/types";
export default async function Page({searchParams}:{searchParams:Promise<SearchParams>}) {
 const params=await searchParams;const query=new URLSearchParams();
 for(const [key,value] of Object.entries(params))if(typeof value==='string')query.set(key,value);
 redirect(`/marketplace${query.size?`?${query}`:''}`);
}
