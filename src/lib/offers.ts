export type PurchaseOffer={id:string;conversation_id:string;created_by:string;quantity:number;quantity_unit:string;units_per_package:number;unit_price:number;listed_unit_price:number;status:"requested"|"countered"|"accepted"|"denied"|"counter_declined"|"withdrawn"|"shipped";revision:number;carrier:"FedEx"|"UPS"|null;tracking_number:string;created_at:string;updated_at:string};
export type OfferListing={id:string;revision:number;quantity:number;quantity_unit:string;price_usd:number;units_per_package:number};
export type OfferRow=PurchaseOffer&{listing_id:string;buyer_facility_id:string;seller_facility_id:string;buyer_name:string;seller_name:string;name:string;catalog_number:string;action_facility_id:string;needs_action:boolean};
export type OfferDirectory={items:OfferRow[];total:number;action_count:number};
export const money=(amount:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(amount);
export function offerTotal(quantity:number,unitPrice:number){
 if(!Number.isSafeInteger(quantity)||quantity<0||!Number.isFinite(unitPrice)||unitPrice<0)return "—";
 const cents=BigInt(quantity)*BigInt(Math.round(unitPrice*100));
 return `$${new Intl.NumberFormat("en-US").format(cents/BigInt(100))}.${String(cents%BigInt(100)).padStart(2,"0")}`;
}
export const offerStatus:Record<PurchaseOffer["status"],string>={requested:"Awaiting seller response",countered:"Awaiting buyer response",accepted:"Accepted — awaiting seller shipping",denied:"Denied by seller",counter_declined:"Counteroffer declined — closed",withdrawn:"Withdrawn by buyer",shipped:"Shipment confirmed by seller"};
