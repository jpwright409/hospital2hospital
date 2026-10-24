import Link from "next/link";
import type {InventoryListing} from "@/lib/inventory/types";
import {ListingVisual} from "./listing-photos";
import {Icon} from "./marketplace";

export function InventoryCard({listing}:{listing:InventoryListing}){
 return <article className="listing-card">
  <div className="card-image"><Link href={`/listings/${listing.id}`} tabIndex={-1} aria-hidden="true"><ListingVisual photos={listing.photos??[]} name={listing.name}/></Link><span className="condition-tag">{listing.condition}</span></div>
  <div className="card-body">
   <span className="eyebrow" title={listing.manufacturer}>{listing.manufacturer}</span>
   <Link className="card-title" href={`/listings/${listing.id}`} title={listing.name}>{listing.name}</Link>
   <p className="catalog" title={`CAT # ${listing.catalog_number}`}>CAT # <strong>{listing.catalog_number}</strong></p>
   <div className="card-quantity"><div><div className="card-price-line"><strong>{new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(listing.price_usd)}</strong>{listing.price_negotiable&&<span className="badge">Negotiable</span>}</div><small className="card-price-unit">/ {listing.quantity_unit} · USD</small></div><span>{listing.quantity} {listing.quantity_unit} available</span></div>
   <p className="card-package muted">{listing.units_per_package} item(s) per {listing.quantity_unit}</p>
   <div className="card-location"><Icon name="pin" size={15}/><span className="card-state">{listing.facility.state}</span><span className="card-facility" title={listing.facility.name}>{listing.facility.name}</span></div>
  </div>
 </article>;
}
