import { ConversationView } from "@/components/conversations";
import type { SearchParams } from "@/lib/inventory/types";
export default async function Page({params,searchParams}: {params:Promise<{id:string}>;searchParams:Promise<SearchParams>}) {return <ConversationView id={(await params).id} params={await searchParams}/>;}
