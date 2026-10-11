import { ListingForm } from "@/components/marketplace";
import { ConnectedEditor } from "@/components/connected-inventory";
import { getAppMode } from "@/lib/app-mode";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return getAppMode() === "connected" ? <ConnectedEditor id={id}/> : <ListingForm id={id}/>; }
