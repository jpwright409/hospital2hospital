import Link from "next/link";
import {requireUser,serviceError,loadAccount} from "@/lib/auth/server";
import {getAppMode} from "@/lib/app-mode";
import {money,offerTotal,offerStatus,type OfferDirectory} from "@/lib/offers";
import {MessageFacilitySwitcher,type MessageFacility} from "./message-notifications";
import type {SearchParams} from "@/lib/inventory/types";
export async function PendingOfferSummary(){
 const {supabase}=await requireUser();const result=await supabase.rpc("my_purchase_offers",{p_page:1,p_direction:"all",p_history:false});
 if(result.error)throw new Error(serviceError(result.error));const data=result.data as OfferDirectory;
 return <section className="panel pending-offer-summary"><h2>Pending offers</h2><p>{data.total} open purchase offers across your eligible facilities · {data.action_count} awaiting your facility&apos;s action.</p>{data.items.slice(0,5).map(o=><p key={o.id}><Link href={`/inbox/${o.conversation_id}#purchase-offers`}>{o.name}</Link> · {offerStatus[o.status]}{o.needs_action&&<span className="badge">Action needed</span>}</p>)}<Link className="text-link" href="/account/offers">Review all pending offers →</Link></section>;
}
export async function PurchaseOffersPage({params}:{params:SearchParams}){
 if(getAppMode()==="demo")return <div className="container page-section"><h1>Pending offers</h1><p>Purchase offers require a connected account.</p></div>;
 const account=await loadAccount();const {supabase}=await requireUser();
 const page=typeof params.page==="string"&&/^\d+$/.test(params.page)?Math.min(100000,Math.max(1,Number(params.page))):1;
 const direction=params.direction==="buying"||params.direction==="selling"?params.direction:"all",history=params.history==="yes";
 const [result,facilities]=await Promise.all([supabase.rpc("my_purchase_offers",{p_page:page,p_direction:direction,p_history:history}),supabase.rpc("my_message_facilities")]);
 if(result.error||facilities.error)throw new Error(serviceError(result.error??facilities.error));const data=result.data as OfferDirectory;
 const url=(p:number,d=direction,h=history)=>`/account/offers?${new URLSearchParams({page:String(p),direction:d,history:h?"yes":"no"})}`;
 return <div className="container page-section conversation-container"><Link href="/account">← My account</Link><div className="page-heading"><h1>{history?"Offer history":"Pending offers"}</h1><p>All offers for facilities where you have conversation access. Eligible colleagues share these offers; they are not limited to the employee who sent them.</p></div><nav className="approval-tabs" aria-label="Offer views">{([['all','All facilities'],['buying','Purchases'],['selling','Sales']] as const).map(([value,label])=><Link className={`button ${direction===value?"primary":"secondary"}`} aria-current={direction===value?"page":undefined} href={url(1,value)} key={value}>{label}</Link>)}<Link className="button secondary" href={url(1,direction,!history)}>{history?"Pending only":"Include completed offers"}</Link></nav><MessageFacilitySwitcher facilities={facilities.data as MessageFacility[]} activeId={account.active?.id??null} returnTo="/account/offers"/><p className="muted">Select the relevant facility before responding in its conversation. Acceptance allocates stock; H2H does not process payment or verify delivery.</p><p>{data.total} offers · {data.action_count} awaiting your facility&apos;s action</p><OfferRows items={data.items}/>{!data.total&&<p className="notice">No offers in this view. Open a product&apos;s facility conversation to make an offer.</p>}<nav className="inventory-pagination" aria-label="Offer pages">{page>1&&<Link href={url(page-1)}>Previous</Link>}<span>Page {page} of {Math.max(1,Math.ceil(data.total/20))}</span>{page*20<data.total&&<Link href={url(page+1)}>Next</Link>}</nav></div>;
}

export function OfferRows({items}:{items:OfferDirectory["items"]}){return <div className="conversation-list">{items.map(o=><article className="panel pending-offer-row" key={o.id}><div><h2>{o.name}</h2><p>CAT # {o.catalog_number}</p><p>{o.buyer_name} → {o.seller_name}</p><p>{o.quantity} {o.quantity_unit} × {money(Number(o.unit_price))} = <strong>{offerTotal(o.quantity,Number(o.unit_price))}</strong></p><span className="badge">{offerStatus[o.status]}</span>{o.needs_action&&<span className="badge">Action needed</span>}</div><Link className="button secondary" href={`/inbox/${o.conversation_id}#purchase-offers`}>Review in conversation</Link></article>)}</div>;}
