import { Marketplace } from "@/components/marketplace";
import { ConnectedMarketplace } from "@/components/connected-inventory";
import { getAppMode } from "@/lib/app-mode";
import { type SearchParams } from "@/lib/inventory/types";
export default async function Page({searchParams}: {searchParams: Promise<SearchParams>}) { return getAppMode() === "connected" ? <ConnectedMarketplace params={await searchParams} saved/> : <Marketplace params={await searchParams} savedOnly/>; }
