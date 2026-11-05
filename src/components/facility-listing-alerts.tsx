import Link from "next/link";
import {createClient} from "@/lib/supabase/server";
import {serviceError} from "@/lib/auth/server";
type ListingAlert={id:string;listing_id:string;product_name:string;catalog_number:string;reason:string;created_at:string};
export async function FacilityListingAlerts({facilityId}:{facilityId:string}){
 const result=await (await createClient()).from("facility_listing_alerts").select("id,listing_id,product_name,catalog_number,reason,created_at",{count:"exact"}).eq("facility_id",facilityId).is("cleared_at",null).order("created_at",{ascending:false}).order("id").limit(20);
 if(result.error)throw new Error(serviceError(result.error));
 return <FacilityListingAlertContent alerts={result.data??[]} count={result.count??0}/>;
}
export function FacilityListingAlertContent({alerts,count}:{alerts:ListingAlert[];count:number}){
 if(!alerts.length)return null;
 return <section className="panel facility-moderation-notices" aria-label="Rejected listing notices"><h2>Listings need your attention</h2><p>These listings were rejected and removed from the marketplace. Review the reason, make any needed corrections, and contact support. An administrator must clear the rejection before you can republish.</p>{alerts.map(a=><article key={a.id}><span className="badge status-rejected">Listing rejected</span><h3>{a.product_name}</h3><small>CAT # {a.catalog_number} · {new Date(a.created_at).toISOString().slice(0,10)}</small><p className="pre-wrap"><strong>Reason:</strong> {a.reason}</p><div className="account-links"><Link href={`/listings/${a.listing_id}/edit`}>Edit listing</Link><Link href="/help">Get Help</Link></div></article>)}{count>20&&<small>Showing the 20 most recent of {count} current notices.</small>}</section>;
}
