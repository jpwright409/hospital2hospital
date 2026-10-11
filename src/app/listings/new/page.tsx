import { ListingForm } from "@/components/marketplace";
import { ConnectedEditor } from "@/components/connected-inventory";
import { getAppMode } from "@/lib/app-mode";
import { type SearchParams } from "@/lib/inventory/types";
export default async function Page({searchParams}: {searchParams: Promise<SearchParams>}) { return getAppMode() === "connected" ? <ConnectedEditor params={await searchParams}/> : <ListingForm/>; }
