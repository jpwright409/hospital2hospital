export type CatalogReviewItem = {
 id:string;revision:number;manufacturer_id:string;manufacturer:string;catalog_number:string;
 name:string;category:string;description:string;product_kind:string|null;gtin:string|null;
 archived_at:string|null;listing_count:number;
};
export type MarketplaceReviewItem = {
 id:string;facility_id:string;revision:number;name:string;manufacturer:string;catalog_number:string;
 facility_name:string;facility_state:string;quantity:number|null;quantity_unit:string|null;price_usd:number|null;
 status:string;moderation_rejected:boolean;deleted_at:string|null;rejection_reason:string|null;
};
