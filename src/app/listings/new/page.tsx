import { ListingForm } from "@/components/marketplace";
import { ConnectedWizard } from "@/components/connected-wizard";
import { getAppMode } from "@/lib/app-mode";
import { type SearchParams } from "@/lib/inventory/types";
export default async function Page({searchParams}: {searchParams: Promise<SearchParams>}) { return getAppMode() === "connected" ? <ConnectedWizard params={await searchParams}/> : <ListingForm/>; }
