import Link from "next/link";
import {randomUUID} from "node:crypto";
import {getAppMode} from "@/lib/app-mode";
import {loadAccount,serviceError} from "@/lib/auth/server";
import {createClient} from "@/lib/supabase/server";
import {inventoryFilters} from "@/lib/inventory/server";
import {ProductSubmissionForm} from "@/components/product-forms";
export default async function Page({searchParams}:{searchParams:Promise<{page?:string}>}){
 if(getAppMode()!=="connected")return <div className="container page-section"><h1>Product submissions</h1><p>Administrator product approval is available in connected mode. Demo inventory remains fictional.</p></div>;
 const account=await loadAccount(),supabase=await createClient();const params=await searchParams;const page=params.page&&/^\d+$/.test(params.page)?Math.min(100000,Math.max(1,Number(params.page))):1;
 if(!account.active||!account.capabilities.canPublish)return <div className="container page-section"><h1>Product submissions</h1><p className="notice">Select an approved facility with an owner or inventory editor membership in <Link href="/account">My account</Link>.</p></div>;
 const [filters,submissions]=await Promise.all([inventoryFilters(),supabase.from("product_submissions").select("*",{count:"exact"}).eq("facility_id",account.active.id).order("created_at",{ascending:false}).order("id").range((page-1)*20,page*20-1)]);
 if(submissions.error)throw new Error(serviceError(submissions.error));
 return <div className="container page-section form-container"><Link href="/listings/new" className="text-link">Back to create listing</Link><h1>Submit a new product line</h1><p>Posting as {account.active.name}. Submit reference information only. Administrator approval adds the product to the catalog; it does not create inventory or publish a listing.</p><section className="panel"><ProductSubmissionForm id={randomUUID()} facilityId={account.active.id} manufacturers={filters.manufacturers}/></section><h2>Your facility&apos;s submissions</h2>{submissions.data.map(s=><section className="panel product-request-card" key={`${s.id}-${s.revision}`}><h3>{s.name}</h3><p>{s.manufacturer} · {s.catalog_number}</p><span className="badge">{s.status}</span>{s.review_note&&<p className="pre-wrap">{s.review_note}</p>}{s.status==="approved"&&s.product_id&&<Link className="button secondary" href={`/listings/new?product=${s.product_id}`}>Create a listing for this product</Link>}</section>)}{!submissions.data.length&&<p className="notice">No submissions on this page.</p>}<nav className="inventory-pagination" aria-label="Product submission pages">{page>1&&<Link href={`/products/submit?page=${page-1}`}>Previous</Link>}<span>Page {page}</span>{page*20<(submissions.count??0)&&<Link href={`/products/submit?page=${page+1}`}>Next</Link>}</nav></div>;
}
