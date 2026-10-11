import { Dashboard } from "@/components/marketplace";
import { ConnectedDashboard } from "@/components/connected-inventory";
import { getAppMode } from "@/lib/app-mode";
import { type SearchParams } from "@/lib/inventory/types";
export default async function Page({searchParams}: {searchParams: Promise<SearchParams>}) { return getAppMode() === "connected" ? <ConnectedDashboard params={await searchParams}/> : <Dashboard/>; }
