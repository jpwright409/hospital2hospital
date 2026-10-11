import Link from "next/link";
import { requirePlatformAdministrator, serviceError } from "@/lib/auth/server";
import { BoostReview } from "@/components/boost-forms";
type Request = {id:string;listing_id:string;status:string;revision:number;review_note:string;name:string;catalog_number:string;facility_name:string;facility_status:string;listing_status:string;slot:number|null};
export default async function Page({searchParams}:{searchParams:Promise<{page?:string}>}) {
 const {supabase}=await requirePlatformAdministrator();const params=await searchParams;
 const page=params.page && /^\d+$/.test(params.page)?Math.min(100000,Math.max(1,Number(params.page))):1;
 const result=await supabase.rpc('boost_review_queue',{p_page:page});if(result.error)throw new Error(serviceError(result.error));
 const queue=result.data as {items:Request[];total:number};
 return <div className="container page-section conversation-container"><h1>Featured listing review</h1><p>Approve up to two placements, reject requests, or remove a feature. Selecting an occupied slot replaces its current listing. Only active listings from approved facilities appear publicly.</p>
 {!queue.total && <p className="notice">No boost requests yet.</p>}{queue.items.map(r=><section className="panel boost-review-card" key={`${r.id}-${r.revision}`}><h2>{r.name}</h2><p>{r.catalog_number} · {r.facility_name}</p><p>Request: {r.status}{r.slot && ` · Slot ${r.slot}`} · Listing: {r.listing_status} · Facility: {r.facility_status}</p>{r.review_note && <p className="pre-wrap">{r.review_note}</p>}<Link className="text-link" href={`/listings/${r.listing_id}`}>View listing (when visible)</Link><BoostReview id={r.id} revision={r.revision} slot={r.slot}/></section>)}
 <nav className="inventory-pagination" aria-label="Boost review pages">{page>1 && <Link href={`/admin/featured?page=${page-1}`}>Previous</Link>}<span>Page {page}</span>{page*20<queue.total && <Link href={`/admin/featured?page=${page+1}`}>Next</Link>}</nav></div>;
}
