import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { serviceError } from "@/lib/auth/server";
type Request = {id:string;listing_id:string;status:string;review_note:string;listings:{products:{name:string;catalog_number:string}}|null};
export async function BoostRequestHistory({facilityId}:{facilityId:string}) {
 const result=await (await createClient()).from('listing_boost_requests').select('id,listing_id,status,review_note,listings(products(name,catalog_number))').eq('facility_id',facilityId).order('updated_at',{ascending:false}).limit(20);
 if(result.error)return <p className="error" role="alert">Boost request status: {serviceError(result.error)}</p>;
 const requests=result.data as unknown as Request[];
 if(!requests.length)return null;
 return <section className="panel boost-request-history"><h2>Recent boost requests</h2><p>Administrator review determines featured placement. Boosting is free for now.</p><ul>{requests.map(r=><li key={r.id}><Link className="text-link" href={`/listings/${r.listing_id}`}>{r.listings?.products.name??'Requested listing'}{r.listings?.products.catalog_number && ` · ${r.listings.products.catalog_number}`}</Link><span className="badge">{r.status}</span>{r.review_note && <p className="pre-wrap">{r.review_note}</p>}</li>)}</ul></section>;
}
