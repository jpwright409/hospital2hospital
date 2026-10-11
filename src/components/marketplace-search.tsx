"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { procedures, type InventoryQuery } from "@/lib/inventory/types";
type Options = { categories: string[]; manufacturers: { id: string; name: string }[]; facilities: { id: string; name: string }[] };
export function MarketplaceSearch({ query, filters, path, demo=false }: { query: InventoryQuery; filters: Options; path: string; demo?:boolean }) {
 const [search, setSearch] = useState(query.q);
 const [session, setSession] = useState(0);
 const dialog = useRef<HTMLDialogElement>(null);
 const trigger = useRef<HTMLButtonElement>(null);
 const applied = { category: query.category, manufacturer: query.manufacturer, seller_facility: query.seller_facility, procedure: query.procedure, kind: query.kind, location: query.location, sort: query.sort };
 return <div className="inventory-search-form">
  <form action={path}><div className="search"><input aria-label="Search inventory" name="q" type="search" maxLength={200} value={search} onChange={e => setSearch(e.target.value)} placeholder="Catalog number, manufacturer, or product name"/><button className="button primary">Search inventory</button></div>{Object.entries(applied).map(([name,value]) => value && <input key={name} type="hidden" name={name} value={value}/>)}</form>
  <div className="inventory-filter-actions"><button ref={trigger} className="button secondary show-filters-button" type="button" onClick={() => { setSession(v => v + 1); dialog.current?.showModal(); }}>Show filters</button><Link className="button secondary" href={search ? `${path}?q=${encodeURIComponent(search)}` : path}>Clear filters</Link><Link className="button secondary" href="/watchlist">Watchlist</Link></div>
  <dialog ref={dialog} className="marketplace-filter-dialog" aria-label="Marketplace filters" onClose={() => trigger.current?.focus()}>
   <form key={session} action={path}><h2>Filter inventory</h2><input type="hidden" name="q" value={search}/><div className="inventory-filter-grid">
    <label>Category<select name="category" defaultValue={query.category}><option value="">All categories</option>{filters.categories.map(c => <option key={c}>{c}</option>)}</select></label>
    <label>Manufacturer<select name="manufacturer" defaultValue={query.manufacturer}><option value="">All manufacturers</option>{filters.manufacturers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
    <label>Facility<select name="seller_facility" defaultValue={query.seller_facility}><option value="">All facilities</option>{filters.facilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>
    {!demo && <label>Procedure<select name="procedure" defaultValue={query.procedure}><option value="">All procedures</option>{procedures.map(p => <option key={p}>{p}</option>)}</select></label>}
    {!demo && <label>Product type<select name="kind" defaultValue={query.kind}><option value="">All types</option><option value="capital">Capital equipment</option><option value="disposable">Disposable</option></select></label>}
    <label>Location<input name="location" maxLength={100} defaultValue={query.location} placeholder="City or two-letter state"/></label>
    <label>Sort<select name="sort" defaultValue={query.sort}><option value="newest">Newest first</option><option value="price_low">Price: low to high</option><option value="price_high">Price: high to low</option></select></label>
   </div><div className="profile-dialog-actions"><button className="button primary">Apply filters</button><button className="button secondary" type="button" onClick={() => dialog.current?.close()}>Cancel</button></div></form>
  </dialog>
 </div>;
}
