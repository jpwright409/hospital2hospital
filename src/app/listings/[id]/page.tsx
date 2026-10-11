import { Detail } from "@/components/marketplace";
import { ConnectedDetail } from "@/components/connected-inventory";
import { getAppMode } from "@/lib/app-mode";
export default async function Page({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return getAppMode() === "connected" ? <ConnectedDetail id={id}/> : <Detail id={id}/>; }
