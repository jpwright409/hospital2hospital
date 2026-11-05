import Link from "next/link";
import {requirePlatformAdministrator,serviceError} from "@/lib/auth/server";
import {CatalogReviewActions} from "@/components/catalog-admin-forms";
import type {CatalogReviewItem} from "@/lib/admin/review-types";
import type {SearchParams} from "@/lib/inventory/types";

export default async function Page({searchParams}:{searchParams:Promise<SearchParams>}){
 const {supabase}=await requirePlatformAdministrator();const params=await searchParams;
 const q=typeof params.q==="string"?params.q.slice(0,200):"",archived=params.status==="deleted";
 const number=Number(params.page),page=Number.isSafeInteger(number)&&number>0&&number<=100000?number:1;
 const [result,manufacturers]=await Promise.all([supabase.rpc("admin_catalog_directory",{p_query:q,p_page:page,p_archived:archived}),supabase.from("manufacturers").select("id,name").order("name")]);
 if(result.error||manufacturers.error)throw new Error(serviceError(result.error??manufacturers.error));
 const items=result.data.items as CatalogReviewItem[],total=Number(result.data.total);
 const url=(next:number)=>`/admin/catalog?${new URLSearchParams({q,status:archived?"deleted":"available",page:String(next)})}`;
 return <div className="container page-section"><div className="page-heading"><h2 className="facilitator-section-title">Product Review</h2><p>Search and maintain the approved product catalog. Product approvals handles new submissions; edits here update shared references.</p></div><form className="admin-review-search" action="/admin/catalog"><label>Product, catalog / SKU, manufacturer or category<input type="search" name="q" maxLength={200} defaultValue={q}/></label><label>Catalog status<select name="status" defaultValue={archived?"deleted":"available"}><option value="available">Available products</option><option value="deleted">Deleted from catalog</option></select></label><button className="button secondary">Search products</button></form><p className="muted">{total} products · 20 per page</p><div className="table-wrap admin-review-table"><table><thead><tr><th>Product</th><th>Manufacturer / SKU</th><th>Category / type</th><th>Listings using product</th><th>Actions</th></tr></thead><tbody>{items.map(p=><tr key={`${p.id}-${p.revision}`}><td><strong>{p.name}</strong></td><td>{p.manufacturer}<small>{p.catalog_number}</small></td><td>{p.category}<small>{p.product_kind||"Unclassified"}</small></td><td>{p.listing_count}</td><td><CatalogReviewActions product={p} manufacturers={manufacturers.data??[]}/></td></tr>)}</tbody></table></div>{!items.length&&<p className="notice">No matching products.</p>}<nav className="inventory-pagination" aria-label="Catalog pages">{page>1&&<Link className="button secondary" href={url(page-1)}>Previous</Link>}<span>Page {page} of {Math.max(1,Math.ceil(total/20))}</span>{page*20<total&&<Link className="button secondary" href={url(page+1)}>Next</Link>}</nav></div>;
}
