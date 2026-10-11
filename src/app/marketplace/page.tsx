import { Marketplace } from "@/components/marketplace";
import { ConnectedMarketplace } from "@/components/connected-inventory";
import { getAppMode } from "@/lib/app-mode";
import { type SearchParams } from "@/lib/inventory/types";
export default async function Page({searchParams}: {searchParams: Promise<SearchParams>}) { const params = await searchParams; return getAppMode() === "connected" ? <ConnectedMarketplace params={params}/> : <Marketplace params={params}/>; }
