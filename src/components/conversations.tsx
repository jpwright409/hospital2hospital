import { MessageFacilitySwitcher, type MessageFacility } from "./message-notifications";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { loadAccount,authenticatedClient,serviceError } from "@/lib/auth/server";
import { getAppMode } from "@/lib/app-mode";
import { validUuid } from "@/lib/auth/policy";
import { createClient } from "@/lib/supabase/server";
import { ContactForm,ReplyForm,RefreshConversation,ReadReceipt } from "./conversation-forms";
import type { InventoryListing,SearchParams } from "@/lib/inventory/types";
import type { Conversation,ConversationPage } from "@/lib/conversations/types";
async function BusinessContact({listingId,buyerId}:{listingId:string;buyerId:string}) {
 const {data,error}=await (await createClient()).rpc("listing_business_contact",{p_listing_id:listingId,p_buyer_facility_id:buyerId});
 if(error) throw new Error(serviceError(error));
 if(!data) return null;
 return <section className="notice"><h3>Seller-designated business contact</h3><p>{data.name}</p><p>{data.email}</p><p>{data.phone}</p><small>Shared by the seller with approved buyers. You may also use the private facility conversation.</small></section>;
}
export async function ContactSeller({listing}: {listing:InventoryListing}) {
  if(listing.status!=='active') return <p className="notice">This listing is {listing.status}. New inquiries are unavailable; existing conversations remain in your inbox.</p>;
  const {user}=await authenticatedClient();
  if(!user) return <Link className="button primary" href="/auth/login">Log in to contact seller</Link>;
  const account=await loadAccount();
  if(!account.active || !account.capabilities.canInquire) return <p className="notice">Contact Seller requires an approved facility and active owner, facility administrator, or inventory editor membership. <Link href="/account">Select or onboard a facility</Link>.</p>;
  if(account.active.id===listing.facility_id) return <p className="notice">You cannot inquire about your own facility’s listing.</p>;
  const {data:existing,error}=await (await createClient()).from("conversations").select("id").eq("listing_id",listing.id).eq("buyer_facility_id",account.active.id).maybeSingle();
  if(error) throw new Error(serviceError(error));
  if(existing) return <><BusinessContact listingId={listing.id} buyerId={account.active.id}/><div className="notice"><p>Your facility already has a shared conversation about this listing. Review your colleagues&apos; messages before replying.</p><Link className="button primary" href={`/inbox/${existing.id}`}>Open facility conversation</Link></div></>;
  return <><BusinessContact listingId={listing.id} buyerId={account.active.id}/><ContactForm listingId={listing.id} requestId={randomUUID()} facilityName={account.active.name} facilityId={account.active.id}/></>;
}
const demoNotice=<div className="container page-section"><h1>Facility inbox</h1><p className="notice">Private conversations require connected mode. Demo inquiries remain browser-local and are never delivered.</p><Link href="/dashboard">Back to dashboard</Link></div>;
export async function FacilityInbox({params}: {params:SearchParams}) {
  if(getAppMode()==='demo') return demoNotice;
  const account=await loadAccount();
  const {data:facilities,error:facilityError}=await (await createClient()).rpc("my_message_facilities");
  if(facilityError) throw new Error(serviceError(facilityError));
  const switcher=<MessageFacilitySwitcher facilities={facilities as MessageFacility[]} activeId={account.active?.id ?? null}/>;
  if(!account.active || !account.capabilities.canInquire) return <div className="container page-section"><h1>Facility inbox</h1>{switcher}<p className="notice">Select an approved facility with active owner, administrator, or inventory editor membership. Viewers cannot read messages.</p><Link className="button primary" href="/account">My account</Link></div>;
  const page=typeof params.page==='string' && /^\d+$/.test(params.page) ? Math.min(100000,Math.max(1,Number(params.page))) : 1;
  const {data,error}=await (await createClient()).rpc("facility_inbox",{p_facility_id:account.active.id,p_page:page});
  if(error) throw new Error(serviceError(error));
  const result=data as {items:Conversation[];total:number;unread:number};
  return <div className="container page-section"><div className="section-heading"><div><span className="eyebrow">PRIVATE FACILITY CONVERSATIONS</span><h1>Facility inbox</h1><p>{account.active.name} · {result.unread} unread messages for you</p></div><RefreshConversation/></div>{switcher}<p className="notice">This inbox and its conversations are shared with eligible colleagues at your facility. Check existing threads before contacting a seller. Unread indicators are personal to you.</p><div className="conversation-list">{result.items.map(c=><Link className="panel conversation-preview" key={c.id} href={`/inbox/${c.id}`}><div><strong>{c.name}</strong><p>CAT # {c.catalog_number} · {c.buyer_facility_id===account.active!.id ? c.seller_name : c.buyer_name}</p><span className="badge">Listing {c.listing_status}</span></div><div>{Number(c.unread)>0 && <span className="conversation-unread-count"><span aria-hidden="true">{c.unread}</span><span className="sr-only">{c.unread} unread messages</span></span>}<small>{new Date(c.updated_at!).toLocaleString("en-US",{timeZone:"UTC"})} UTC</small></div></Link>)}</div>{!result.total && <p className="notice">No conversations available. Contact a seller from an active listing. Conversations pause if either facility loses approval.</p>}<nav className="inventory-pagination" aria-label="Inbox pages">{page>1 && <Link href={`/inbox?page=${page-1}`}>Previous</Link>}<span>Page {page} of {Math.max(1,Math.ceil(result.total/20))}</span>{page*20<result.total && <Link href={`/inbox?page=${page+1}`}>Next</Link>}</nav><p className="muted">Messages do not send email alerts. Refresh to check for messages; unread counts are personal to your account.</p></div>;
}
export async function ConversationView({id,params}: {id:string;params:SearchParams}) {
  if(getAppMode()==='demo') return demoNotice;
  const account=await loadAccount();
  if(!validUuid(id)) return <div className="container page-section"><h1>Conversation unavailable</h1><Link href="/inbox">Return to inbox</Link></div>;
  const before=typeof params.before==='string' && /^\d+$/.test(params.before) && Number.isSafeInteger(Number(params.before)) && Number(params.before)>0 ? Number(params.before) : null;
  const {data,error}=await (await createClient()).rpc("conversation_page",{p_id:id,p_before_sequence:before});
  if(error?.code==='42501') return <div className="container page-section"><h1>Conversation unavailable</h1><p className="notice">Check participant membership and approval of both facilities. Only eligible participant members can read this conversation.</p><Link href="/inbox">Return to inbox</Link></div>;
  if(error) throw new Error(serviceError(error));
  const result=data as ConversationPage;const c=result.conversation;
  const client=await createClient();
  const [facilities,receipt]=await Promise.all([
    client.rpc("my_message_facilities"),
    client.from("conversation_reads").select("last_sequence").eq("conversation_id",id).eq("user_id",account.user.id).maybeSingle(),
  ]);
  if(facilities.error || receipt.error) throw new Error(serviceError(facilities.error ?? receipt.error));
  const lastRead=Number(receipt.data?.last_sequence ?? 0);
  const canReply=account.active && account.capabilities.canInquire && [c.buyer_facility_id,c.seller_facility_id].includes(account.active.id);
  return <div className="container page-section conversation-container"><Link className="text-link" href="/inbox">← Facility inbox</Link><div className="section-heading"><div><h1>{c.name}</h1><p>{c.buyer_name} ↔ {c.seller_name} · CAT # {c.catalog_number}</p><span className="badge">Listing {c.listing_status}</span>{c.listing_status!=='active' && <p className="notice">This listing is {c.listing_status}. This existing conversation can continue while both facilities remain approved.</p>}</div><RefreshConversation/></div><MessageFacilitySwitcher facilities={facilities.data as MessageFacility[]} activeId={account.active?.id ?? null}/><ol className="message-list">{result.messages.map(m=><li key={m.id} className={`panel message ${m.author_user_id===account.user.id ? "own-message" : ""}`}><div className="message-meta"><strong>{m.author_label} · {m.author_facility_id===c.buyer_facility_id ? c.buyer_name : c.seller_name}</strong><small>{new Date(m.created_at).toLocaleString("en-US",{timeZone:"UTC"})} UTC</small></div><p>{m.body}</p>{m.author_user_id!==account.user.id && m.sequence>lastRead && <span className="badge">New to you</span>}</li>)}</ol>{result.messages.length>0 && !before && <ReadReceipt id={id} sequence={result.messages[result.messages.length-1].sequence}/>}<nav className="inventory-pagination" aria-label="Message history">{result.has_older && <Link href={`/inbox/${id}?before=${result.messages[0].sequence}`}>Older messages</Link>}{before && <Link href={`/inbox/${id}`}>Latest messages</Link>}</nav>{canReply ? <ReplyForm id={id} requestId={randomUUID()} facilityName={account.active!.name} facilityId={account.active!.id}/> : <p className="notice">Select an eligible participant facility in <Link href="/account">My account</Link> to reply.</p>}<p className="muted">Plain text only · 4,000 characters maximum · No attachments or email notifications.</p></div>;
}
