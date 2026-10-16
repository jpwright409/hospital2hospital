import Link from "next/link";
import {WizardSetupDrafts} from "./wizard-draft-list";
import { randomUUID } from "node:crypto";
import { MarketplaceSearch } from "./marketplace-search";
import { FeaturedListings } from "./featured-listings";
import { BoostRequestHistory } from "./boost-request-history";
import { BoostListing } from "./boost-forms";
import { notFound } from "next/navigation";
import { Icon, ProductArt } from "./marketplace";
import { SavedAction, StatusAction, InventoryEditor, DeleteAction } from "./inventory-forms";
import { loadAccount, requireUser, serviceError } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { catalogProducts, getInventoryListing, inventoryFilters, searchInventory, inventoryError } from "@/lib/inventory/server";
import { inventoryUrl, parseInventoryQuery, type InventoryListing, type InventoryQuery, type SearchParams } from "@/lib/inventory/types";
import { listingPhotos,type ListingPhoto } from "@/lib/photos/server";
import { ListingVisual,PhotoManager } from "./listing-photos";
import { ContactSeller } from "./conversations";
import { ListingDetailView } from "./listing-detail";
const money = (value: number) => new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(value);
function Card({listing}: {listing: InventoryListing}) {
  return <article className="listing-card"><div className="card-image"><Link href={`/listings/${listing.id}`} tabIndex={-1} aria-hidden="true"><ListingVisual photos={listing.photos ?? []} name={listing.name}/></Link><span className="condition-tag">{listing.condition}</span></div><div className="card-body"><span className="eyebrow">{listing.manufacturer}</span><Link className="card-title" href={`/listings/${listing.id}`}>{listing.name}</Link><p className="catalog">CAT # <strong>{listing.catalog_number}</strong></p><div className="card-quantity"><strong>{money(listing.price_usd)}{listing.price_negotiable && <span className="badge">Negotiable</span>}<small> / {listing.quantity_unit} · USD</small></strong><span>{listing.quantity} {listing.quantity_unit} available</span></div><p className="muted">{listing.units_per_package} item(s) per {listing.quantity_unit}</p><div className="card-location"><Icon name="pin" size={15}/>{listing.facility.city}, {listing.facility.state}<span>{listing.facility.name}</span></div></div></article>;
}
function Pagination({query,total,path}: {query: InventoryQuery; total: number; path: string}) {
  const pages = Math.max(1,Math.ceil(total/12));
  return <nav className="inventory-pagination" aria-label="Inventory pages">{query.page>1 && <Link className="button secondary" href={inventoryUrl(path,query,query.page-1)}>Previous</Link>}<span>Page {query.page} of {pages} · {total} results</span>{query.page<pages && <Link className="button secondary" href={inventoryUrl(path,query,query.page+1)}>Next</Link>}</nav>;
}
export async function ConnectedHome() {
  const query = parseInventoryQuery({});
  const [results,filters] = await Promise.all([searchInventory(query),inventoryFilters()]);
  return <><section className="hero"><div className="container hero-grid"><div className="hero-copy"><div className="eyebrow hero-eyebrow">BUILT FOR HEALTHCARE. CONNECTED BY PURPOSE.</div><h1>Your excess.<br/>Their essential.<br/><span>A better connection.</span></h1><p>A free marketplace connecting hospitals and surgery centers with surgical supplies and equipment.</p><form className="search" action="/marketplace"><Icon name="search"/><input name="q" type="search" maxLength={200} aria-label="Search inventory" placeholder="Catalog number, manufacturer, or product name"/><button className="button primary">Search inventory</button></form></div><div className="hero-visual"><div className="visual-grid"/><div className="hero-product"><ProductArt product={{category:"General Surgery"}} demo={false}/><div><span className="eyebrow">FACILITY TO FACILITY</span><strong>Supplies that connect us.</strong><span>From one facility to the next.</span></div></div></div></div></section><section className="trust-strip"><div className="container"><span><Icon name="check"/> Free to list</span><span><Icon name="cross"/> Approved healthcare facilities</span><span><Icon name="box"/> No payments or fees</span></div></section><section className="container section"><div className="section-heading"><div><span className="eyebrow">FIND WHAT YOUR FACILITY NEEDS</span><h2>Browse by specialty</h2></div><Link className="text-link" href="/marketplace">View all inventory <Icon name="arrow"/></Link></div><div className="category-grid">{filters.categories.map(category => <Link className="category-card" key={category} href={`/marketplace?category=${encodeURIComponent(category)}`}><span className="category-icon"><Icon name="cross"/></span><strong>{category}</strong><small>Browse listings →</small></Link>)}</div></section><section className="inventory-section"><div className="container section"><div className="section-heading"><div><h2>Recently listed inventory</h2><p>Facility-posted availability. Reference catalog records alone are never stock.</p></div><Link className="text-link" href="/marketplace">Browse marketplace →</Link></div><div className="listing-grid">{results.items.slice(0,4).map(l => <Card key={l.id} listing={l}/>)}</div>{!results.total && <p className="notice">No inventory has been published yet. Approved facilities can add their actual stock.</p>}</div></section><section className="container section"><div className="seller-banner"><div><h2>Have excess inventory?</h2><p>Give unused supplies a new opportunity to help.</p></div><Link className="button primary" href="/dashboard">Manage your inventory</Link></div><p className="notice">Private conversations connect approved participant facilities. Optional watchlist email alerts can notify you of new inventory.</p></section></>;
}
export async function ConnectedMarketplace({params,saved=false}: {params: SearchParams; saved?: boolean}) {
  if (saved) await requireUser();
  const query = parseInventoryQuery(params); const path = saved ? "/saved" : "/marketplace";
  const [results,filters] = await Promise.all([searchInventory(query,{saved}),inventoryFilters()]);
  let unavailable: {listing_id: string}[] = [];
  if (saved) {
    const {supabase} = await requireUser();
    const {data,error} = await supabase.rpc("unavailable_saved_listings");
    if(error) throw new Error(inventoryError(error));
    unavailable = data ?? [];
  }
  return <div className="container page-section"><div className="marketplace-heading"><div className="page-heading"><span className={`eyebrow${saved ? "" : " marketplace-tagline"}`}>THE FACILITY-TO-FACILITY MARKETPLACE</span><h1>{saved ? "Saved listings" : "Find your next essential."}</h1><p>{saved ? "Saved privately to your account across devices." : "Search actual inventory posted by approved facilities."}</p></div>{!saved && <FeaturedListings/>}</div><MarketplaceSearch key={JSON.stringify(query)} query={query} filters={filters} path={path}/><div className="results-toolbar"><strong>{results.total} listings</strong><span>Prices per quantity unit · USD</span></div><div className="listing-grid">{results.items.map(l => <div key={l.id}><Card listing={l}/>{saved && <SavedAction id={l.id} saved/>}</div>)}</div>{!results.total && <div className="notice">No matching listings. Try clearing filters{saved ? " or save a listing from its detail page" : " or check back when facilities publish stock"}.</div>}<Pagination query={query} total={results.total} path={path}/>{unavailable.length>0 && <section className="panel"><h2>Unavailable saved listings</h2><p>These listings are inactive, sold, or no longer publicly available. Private inventory details are hidden.</p>{unavailable.map(s => <SavedAction key={s.listing_id} id={s.listing_id} saved/>)}</section>}</div>;
}
export async function ConnectedDetail({id}: {id: string}) {
  const listing = await getInventoryListing(id); if (!listing) notFound();
  const photos = await listingPhotos([id]);
  const supabase = await createClient(); const {data:saved,error} = await supabase.rpc("is_listing_saved",{p_listing_id:id});
  if (error) throw new Error(inventoryError(error));
  return <ListingDetailView listing={listing} photos={photos}><ContactSeller listing={listing}/><SavedAction id={id} saved={saved===true}/></ListingDetailView>;
}
export async function ConnectedDashboard({params}: {params: SearchParams}) {
  const account = await loadAccount(); const query = parseInventoryQuery(params);
  if (!account.active) return <div className="container page-section"><h1>Seller inventory</h1><p className="notice">Select an active facility or complete onboarding first.</p><Link className="button primary" href="/account">My account</Link></div>;
  const {data:canView,error} = await (await createClient()).rpc("inventory_can_view",{p_facility_id:account.active.id});
  if (error) throw new Error(serviceError(error));
  if (!canView) return <div className="container page-section"><h1>Seller inventory</h1><p className="notice">An active owner or inventory editor membership is required.</p><Link href="/account">My account</Link></div>;
  const results = await searchInventory(query,{facilityId:account.active.id});
  const wizardResult=await (await createClient()).from("listing_wizard_drafts").select("id,listing_id").eq("facility_id",account.active.id).is("published_at",null);
  if(wizardResult.error)throw new Error(serviceError(wizardResult.error));
  const wizardLinks=new Map((wizardResult.data??[]).map(d=>[d.listing_id,d.id]));
  return <div className="container page-section"><div className="page-heading"><span className="eyebrow">SELLER WORKSPACE</span><h1>Your facility’s inventory</h1><p>{account.active.name} · {account.active.status}</p><Link className="text-link" href="/account">Change active facility</Link></div>{account.capabilities.canPublish ? <div className="seller-primary-actions"><Link className="button primary" href="/listings/new">Create listing</Link><BoostListing activeId={account.active.id}/></div> : <p className="notice">Inventory changes require an approved facility and active owner or inventory editor membership. You can view your existing inventory.</p>}<form key={JSON.stringify(query)} action="/dashboard" className="inventory-filter-grid"><label>Product search<input name="q" maxLength={200} defaultValue={query.q}/></label><label>Status<select name="status" defaultValue={query.status}><option value="">All inventory</option><option value="draft">Drafts</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="sold">Sold</option></select></label><label>Sort<select name="sort" defaultValue={query.sort}><option value="newest">Newest</option><option value="price_low">Price: low to high</option><option value="price_high">Price: high to low</option></select></label><button className="button secondary">Apply</button></form><div className="table-wrap seller-inventory-table"><table><thead><tr><th>Product</th><th>Quantity / package</th><th>USD price</th><th>Status</th><th>Actions</th></tr></thead><tbody>{results.items.map(l => <tr key={l.id}><td><Link href={l.status==="draft"&&wizardLinks.has(l.id)?`/listings/new?draft=${wizardLinks.get(l.id)}`:`/listings/${l.id}${l.status === "draft" ? "/edit" : ""}`}>{l.name}</Link><small>{l.manufacturer} · {l.catalog_number}</small></td><td>{l.quantity} {l.quantity_unit}<small>{l.units_per_package} item(s) each</small></td><td>{money(l.price_usd)} / {l.quantity_unit}{l.price_negotiable && <span className="badge">Negotiable</span>}</td><td>{l.status}</td><td>{account.capabilities.canPublish && <div className="manage-actions"><Link href={l.status==="draft"&&wizardLinks.has(l.id)?`/listings/new?draft=${wizardLinks.get(l.id)}`:`/listings/${l.id}/edit`}>Edit</Link><StatusAction listing={l} status={l.status === "active" ? "inactive" : "active"}/>{l.status !== "sold" && l.status !== "draft" && <StatusAction listing={l} status="sold"/>}<DeleteAction listing={l}/></div>}</td></tr>)}</tbody></table></div>{!results.total && <p className="notice">No inventory found. Catalog reference records are not facility stock.</p>}<Pagination query={query} total={results.total} path="/dashboard"/><WizardSetupDrafts facilityId={account.active.id}/><BoostRequestHistory facilityId={account.active.id}/><p className="muted">Reactivation publishes the existing quantity. Confirm current stock before reactivating a sold listing. Use listing edit to manage photos and the facility inbox to view conversations.</p></div>;
}
export async function ConnectedEditor({id,params={}}: {id?: string; params?: SearchParams}) {
  const account = await loadAccount();
  if (!account.active || !account.capabilities.canPublish) return <div className="container page-section"><h1>Inventory access required</h1><p className="notice">Select an approved facility with an active owner or inventory editor membership.</p><Link className="button primary" href="/account">My account</Link></div>;
  const listing = id ? await getInventoryListing(id) : null;
  if (id && (!listing || listing.facility_id !== account.active.id)) notFound();
  const photos: ListingPhoto[] = listing ? await listingPhotos([listing.id],true) : [];
  const query = typeof params.catalogq === "string" ? params.catalogq : "";
  const filters=await inventoryFilters();
  const products = !id ? await catalogProducts(query) : [];
  let product = products.find(p => p.id === params.product);
  if (!id && typeof params.product === "string" && /^[0-9a-f-]{36}$/i.test(params.product) && !product) {
    const {data,error} = await (await createClient()).from("products").select("*,manufacturers(name)").eq("id",params.product).maybeSingle();
    if (error) throw new Error(inventoryError(error));
    if (data) product = {...data,manufacturer:data.manufacturers.name};
  }
  return <div className="container page-section form-container"><Link className="text-link" href="/dashboard">← Back to inventory</Link><div className="page-heading"><h1>{id ? (listing?.status === "draft" ? "Edit private draft" : "Edit listing") : "List your inventory"}</h1><p>Posting as {account.active.name} · {account.active.city}, {account.active.state}</p></div>{!id && <section className="panel form-panel"><h2>Choose a catalog reference</h2><form action="/listings/new" className="search"><input name="catalogq" aria-label="Search reference catalog" placeholder="Product name or catalog number" defaultValue={query} maxLength={100}/><button className="button secondary">Search catalog</button></form><p>Up to 50 matching reference records. These are product examples, not available stock.</p><div className="catalog-options">{products.map(p => <Link key={p.id} href={`/listings/new?product=${p.id}`} aria-current={product?.id===p.id ? "true" : undefined}>{p.manufacturer} · {p.catalog_number} — {p.name}</Link>)}</div><Link className="text-link" href="/listings/new?propose=1">Propose a new reference product</Link></section>}<InventoryEditor requestId={randomUUID()} key={id ?? product?.id ?? "new"} listing={listing ?? undefined} product={product} manufacturers={filters.manufacturers}/>{listing?.status === "draft" && <div className="notice"><strong>Private draft</strong><p>Add photos and review the details. Save your edits before publishing.</p><StatusAction listing={listing} status="active"/></div>}{listing && <PhotoManager key={JSON.stringify(photos.map(p=>[p.id,p.position,p.is_cover,p.state]))} listingId={listing.id} photos={photos}/>}</div>;
}
