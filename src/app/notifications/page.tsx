import Link from "next/link";
import { getAppMode } from "@/lib/app-mode";
import { requireUser, serviceError } from "@/lib/auth/server";
import { listingUpdateSummary, type ListingUpdate } from "@/lib/notifications";
import { MarkListingUpdatesRead, RefreshNotifications } from "@/components/notification-forms";

export default async function Page({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  if (getAppMode() === "demo") return <div className="container page-section"><h1>Notifications</h1><p className="notice">Persistent notifications require connected mode. Demo inventory is fictional.</p></div>;
  const params = await searchParams;
  const page = params.page && /^\d+$/.test(params.page) ? Math.min(100000, Math.max(1, Number(params.page))) : 1;
  const { supabase } = await requireUser();
  const [updates, facilities] = await Promise.all([
    supabase.rpc("my_saved_listing_updates", { p_page: page }), supabase.rpc("my_message_facilities"),
  ]);
  if (updates.error || facilities.error) throw new Error(serviceError(updates.error ?? facilities.error));
  const result = updates.data as { items: ListingUpdate[]; total: number; unread: number };
  const messageFacilities = facilities.data as { id: string; name: string; unread: number }[];
  const messageUnread = messageFacilities.reduce((sum, f) => sum + Number(f.unread), 0);
  const unreadIds = result.items.filter(n => !n.read_at).map(n => n.id);
  return <div className="container page-section conversation-container">
    <div className="section-heading"><div><h1>Notifications</h1><p>{result.unread} unread listing updates · {messageUnread} unread messages</p></div><RefreshNotifications/></div>
    <section className="panel"><h2>Facility messages</h2><p>Unread messages stay personal; conversations are shared within each facility.</p>
      {messageFacilities.filter(f => Number(f.unread) > 0).map(f => <p key={f.id}>{f.name}: {f.unread} unread</p>)}
      <Link className="text-link" href="/inbox">Open facility inbox and switch facilities →</Link>
    </section>
    <h2>Saved listing updates</h2><p className="muted">Changes recorded after you save a listing. Removing a save removes its notification history. Notices describe the listing at the time of the change.</p>
    {!!unreadIds.length && <MarkListingUpdatesRead ids={unreadIds} all/>}
    <div className="conversation-list">{result.items.map(n => <article className="panel" key={n.id}>
      {!n.read_at && <span className="badge">Unread update</span>}<h3>{n.product_name}</h3><p>CAT # {n.catalog_number}</p>
      <ul>{listingUpdateSummary(n.changes).map(line => <li key={line}>{line}</li>)}</ul>
      <p className="muted">{new Date(n.created_at).toLocaleString("en-US", { timeZone: "UTC" })} UTC</p>
      {n.public_available ? <Link className="text-link" href={`/listings/${n.listing_id}`}>View listing →</Link> : <p className="muted">This listing is currently unavailable publicly.</p>}
      {!n.read_at && <MarkListingUpdatesRead ids={[n.id]}/>}
    </article>)}</div>
    {!result.total && <p className="notice">No saved listing updates yet. <Link href="/marketplace">Browse inventory</Link> and save listings to follow future changes.</p>}
    <nav className="inventory-pagination" aria-label="Notification pages">
      {page > 1 && <Link href={`/notifications?page=${page - 1}`}>Previous</Link>}<span>Page {page} of {Math.max(1, Math.ceil(result.total / 20))}</span>
      {page * 20 < result.total && <Link href={`/notifications?page=${page + 1}`}>Next</Link>}
    </nav>
  </div>;
}
