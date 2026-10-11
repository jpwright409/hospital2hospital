import { FacilityInbox } from "@/components/conversations";
import type { SearchParams } from "@/lib/inventory/types";
export default async function Page({searchParams}: {searchParams:Promise<SearchParams>}) {return <FacilityInbox params={await searchParams}/>;}
