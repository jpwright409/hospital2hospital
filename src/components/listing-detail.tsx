import Link from "next/link";
import type {ReactNode} from "react";
import type {InventoryListing} from "@/lib/inventory/types";
import type {ListingPhoto} from "@/lib/photos/server";
import {ListingVisual} from "./listing-photos";

export function ListingDetailView({listing,photos,children}:{listing:InventoryListing;photos:ListingPhoto[];children:ReactNode}) {
  const productType=listing.inventory_kind==="capital"?"Capital equipment":listing.inventory_kind==="disposable"?"Disposable supplies":"Not specified";
  const expiration=listing.expiration?new Intl.DateTimeFormat("en-US",{month:"short",day:"numeric",year:"numeric",timeZone:"UTC"}).format(new Date(`${listing.expiration}T00:00:00Z`)):"Not provided";
  const description=listing.description?.trim();
  const details=[
    ["Category",listing.category], ["Procedure",listing.procedure_type], ["Product type",productType],
    ["Condition",listing.condition], ["Sterile",listing.sterile?"Yes":"No"],
    ["Use type",listing.single_use?"Single-use":"Reusable"], ["Expiration",expiration],
    ["Packaging",listing.packaging?.trim()||"Not provided"],
  ];
  return <div className="container page-section listing-detail">
    <Link className="text-link" href="/marketplace">← Back to marketplace</Link>
    <div className="detail-grid">
      <div className="listing-detail-content">
        <ListingVisual photos={photos} large name={listing.name}/>
        <section className="panel listing-details-panel" aria-labelledby="product-details-title">
          <h2 id="product-details-title">Product details</h2>
          {description&&description.toLowerCase()!==listing.name.trim().toLowerCase()&&<p className="listing-description pre-wrap">{description}</p>}
          <dl className="listing-specs">{details.map(([label,value])=><div key={label}><dt>{label}</dt><dd>{value||"Not specified"}</dd></div>)}</dl>
          <div className="listing-seller-notes"><h3>Seller notes</h3><p className="pre-wrap">{listing.notes?.trim()||"No additional notes."}</p></div>
        </section>
      </div>
      <section className="panel listing-summary">
        <span className="eyebrow">{listing.manufacturer}</span>
        <h1>{listing.name}</h1>
        <p className="catalog">CAT # <strong>{listing.catalog_number}</strong></p>
        <div className="listing-asking-price"><strong>{new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(listing.price_usd)}</strong><span>/ {listing.quantity_unit} · USD</span>{listing.price_negotiable&&<span className="badge">Negotiable</span>}</div>
        <p className="listing-availability">{listing.quantity} {listing.quantity_unit} available · {listing.units_per_package} item(s) per {listing.quantity_unit}</p>
        <span className="badge listing-status">{listing.status}</span>
        <div className="seller-info listing-facility"><h3>{listing.facility.name}</h3><p>{listing.facility.city}, {listing.facility.state}</p></div>
        <div className="listing-contact-actions">{children}</div>
      </section>
    </div>
  </div>;
}
