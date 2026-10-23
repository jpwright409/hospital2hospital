import { Marketplace } from "@/components/marketplace";
import { ConnectedMarketplace } from "@/components/connected-inventory";
import { getAppMode } from "@/lib/app-mode";
import { type SearchParams } from "@/lib/inventory/types";
import Link from "next/link";
export default async function Page({searchParams}: {searchParams: Promise<SearchParams>}) {
 const params = await searchParams;
 return <div className="marketplace-page"><nav className="container marketplace-resource-links" aria-label="Facility resources">
  <Link href="/cost-savings">Ideas to save you money</Link>
  <Link href="/our-partners#dme-partners">DME Partnerships</Link>
  <Link href="/our-partners#charity-partners">Charity Partners</Link>
 </nav>{getAppMode() === "connected" ? <ConnectedMarketplace params={params}/> : <Marketplace params={params}/>}</div>;
}
