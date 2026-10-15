import Link from "next/link";
import {redirect,notFound} from "next/navigation";
import {authenticatedClient} from "@/lib/auth/server";
import {getAppMode} from "@/lib/app-mode";
import {validUuid} from "@/lib/auth/policy";
import {getInventoryListing} from "@/lib/inventory/server";
import {listingPhotos} from "@/lib/photos/server";
import {PhotoManager} from "@/components/listing-photos";

export default async function Page({params}:{params:Promise<{id:string}>}) {
  const {id}=await params;if(getAppMode()!=="connected"||!validUuid(id))notFound();
  const next=`/listings/${id}/photos`;
  const {supabase,user}=await authenticatedClient();
  if(!user?.email_confirmed_at)redirect(`/auth/login?next=${encodeURIComponent(next)}${user?"&notice=confirmation":""}`);
  const {data,error}=await supabase.rpc("photo_can_manage",{p_listing_id:id});
  if(error)throw new Error("Photo access could not be checked. Retry.");
  if(!data)return <div className="container page-section"><h1>Photo access unavailable</h1><p className="notice">Sign in with an approved owning-facility owner or inventory editor account. This link does not grant access to another facility.</p><Link href="/account">My account</Link></div>;
  const listing=await getInventoryListing(id);if(!listing)notFound();
  return <div className="container page-section form-container"><div className="page-heading"><h1>Add listing photos</h1><h2>{listing.name}</h2><p>{listing.manufacturer} · {listing.catalog_number}</p><p>{listing.facility.name} · Status: {listing.status}</p>{listing.status==="draft"&&<p className="notice">Private draft. Uploading photos does not publish this listing. Return to the listing editor to review and publish.</p>}</div><PhotoManager listingId={id} photos={await listingPhotos([id],true)}/><p className="muted">The photo link works for any facility you are authorized to manage. To edit listing details, select this facility in My account first; switching the global selection may affect your other open tabs.</p><Link className="button secondary" href={`/listings/${id}/edit`}>Review listing</Link><Link className="text-link" href="/dashboard">My Facility</Link></div>;
}
