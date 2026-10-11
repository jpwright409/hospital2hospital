import Link from "next/link";
import { randomUUID } from "node:crypto";
import { requireUser,serviceError } from "@/lib/auth/server";
import { getAppMode } from "@/lib/app-mode";
import { inventoryFilters } from "@/lib/inventory/server";
import { emailDeliveryConfigured } from "@/lib/email-config";
import { WatchlistForm,RemoveWatchlist,type Watchlist } from "@/components/community-forms";
import { RefreshConversation } from "@/components/conversation-forms";
export default async function Page() {
 if(getAppMode()==="demo") return <div className="container page-section watchlist-page"><h1>Watchlists</h1><p>Persistent watchlists require connected mode. Demo inventory is fictional.</p></div>;
 const {supabase}=await requireUser();const [watches,matches,filters]=await Promise.all([
  supabase.from("watchlists").select("id,name,criteria,enabled,email_enabled").order("created_at",{ascending:false}),
  supabase.from("watchlist_matches").select("id,watchlist_id,listing_id,product_name,catalog_number,created_at").order("created_at",{ascending:false}).limit(100),inventoryFilters(),
 ]);
 if(watches.error || matches.error) throw new Error(serviceError(watches.error??matches.error));
 const ready=emailDeliveryConfigured();const newId=randomUUID();
 return <div className="container page-section form-container watchlist-page"><div className="section-heading"><h1>Watchlists</h1><RefreshConversation label="Refresh matches"/></div><p>Follow future listings by manufacturer, catalog number, words, procedure or product type. All selected filters must match. Saves follow changes to existing listings; watchlists find newly posted inventory.</p><div className="watchlist-browse"><Link className="button secondary" href="/marketplace">Browse current inventory</Link></div>
 <section className="panel watchlist-create"><h2>Create a watchlist</h2><WatchlistForm key={newId} watch={{id:newId,name:"",criteria:{},enabled:true,email_enabled:false}} manufacturers={filters.manufacturers} emailReady={ready}/></section>
 {(watches.data as Watchlist[]).map(w=><section key={w.id} className="panel"><h2>{w.name}</h2><WatchlistForm key={JSON.stringify(w)} watch={w} manufacturers={filters.manufacturers} emailReady={ready} existing/><RemoveWatchlist id={w.id}/><h3>Recent matches</h3>{matches.data?.filter(m=>m.watchlist_id===w.id).map(m=><p key={m.id}><Link href={`/listings/${m.listing_id}`}>{m.product_name} (view current availability)</Link> · CAT # {m.catalog_number} · {new Date(m.created_at).toISOString().slice(0,10)}</p>)}<small>Up to 100 recent matches across your watchlists. Historical matches may no longer be available. No retrospective matches are created.</small></section>)}
 </div>;
}
