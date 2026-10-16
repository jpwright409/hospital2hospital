export type PublicFacility = { id: string; name: string; city: string; state: string; facility_type: string };
export type CatalogProduct = { id: string; manufacturer_id: string; catalog_number: string; name: string; category: string; description: string; manufacturer: string; product_kind?: "capital" | "disposable" | null };
export type InventoryListing = CatalogProduct & {
  product_id: string; facility_id: string; facility: PublicFacility;
  quantity: number; quantity_unit: string; units_per_package: number; price_usd: number;
  inventory_kind: string; price_negotiable: boolean; procedure_type: string; deleted_at: string | null;
  currency: "USD"; condition: string; expiration: string | null; sterile: boolean; single_use: boolean;
  packaging: string; notes: string; status: "draft" | "active" | "inactive" | "sold";
  revision: number; created_at: string; updated_at: string;
  photos?: import("@/lib/photos/server").ListingPhoto[];
};
export type SearchParams = Record<string, string | string[] | undefined>;
export type InventoryQuery = { q: string; category: string; manufacturer: string; location: string; sort: string; page: number; status: string; seller_facility: string; procedure: string; kind: string };
export type SearchResult = { items: InventoryListing[]; total: number; page: number; page_size: number };
export type InventoryState = { error?: string; success?: string };
export type WizardDraft = {id:string;facility_id:string;product_id:string;data:Record<string,string>;step:number;revision:number;listing_id:string|null;listing_revision:number|null;published_at:string|null};
export const initialWizardDetails:Record<string,string> = {inventory_kind:"",quantity:"",quantity_unit:"each",units_per_package:"1",price_usd:"",price_negotiable:"no",procedure_type:"Other",condition:"New / unopened",expiration:"",sterile:"no",single_use:"yes",packaging:"",notes:""};
export function wizardInventoryForm(data:Record<string,string>) {
  const form=new FormData();for(const [key,value] of Object.entries(data))form.set(key,value);form.set("status","draft");return form;
}
export function wizardDetailsComplete(data:Record<string,string>) {
  if(!["capital","disposable"].includes(data.inventory_kind))return false;
  try {validateInventory(wizardInventoryForm(data));return true;}catch{return false;}
}
export const procedures = ["General Surgery","ENT","Orthopedics","Plastic Surgery","Urology","Gynecology / OBGYN","Cardiovascular","Endoscopy / GI","Ophthalmology","Neurosurgery","Wound Care","Other"];
export const quantityUnits = ["each", "box", "case", "pack"];
export const conditions = ["New / unopened", "New / open packaging", "Used — good", "Used — fair"];
export function parseInventoryQuery(params: SearchParams): InventoryQuery {
  const value = (key: string, max = 200) => typeof params[key] === "string" ? params[key].slice(0,max).trim() : "";
  const sort = value("sort"); const page = Number(value("page"));
  return { q: value("q"), category: value("category",100), manufacturer: value("manufacturer",36), location: value("location",100),
    sort: ["newest","price_low","price_high"].includes(sort) ? sort : "newest",
    page: Number.isSafeInteger(page) && page > 0 && page <= 100000 ? page : 1,
    seller_facility: /^[0-9a-f-]{36}$/i.test(value("seller_facility",36)) ? value("seller_facility",36) : "", procedure: procedures.includes(value("procedure")) ? value("procedure") : "", kind: ["capital","disposable"].includes(value("kind")) ? value("kind") : "",
    status: ["draft","active","inactive","sold"].includes(value("status")) ? value("status") : "" };
}
export function inventoryUrl(path: string, query: InventoryQuery, page: number) {
  const params = new URLSearchParams();
  for (const [key,value] of Object.entries({...query,page})) if (value && (key !== "page" || value !== 1)) params.set(key,String(value));
  return `${path}?${params}`;
}
export function validateInventory(form: FormData) {
  const text = (key: string) => String(form.get(key) ?? "").trim();
  const quantity = Number(text("quantity")); const units = Number(text("units_per_package"));
  const price = text("price_usd"); const unit = text("quantity_unit"); const status = text("status");
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100000000) throw new Error("Quantity must be a whole number from 1 to 100,000,000.");
  if (!quantityUnits.includes(unit) || !Number.isInteger(units) || units < 1 || units > 1000000 || (unit === "each" && units !== 1)) throw new Error("Choose a quantity unit and whole package size; each must contain exactly 1 item.");
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(price) || Number(price) > 9999999999.99) throw new Error("Enter a USD price with at most two decimal places, including 0 for free stock.");
  if (!conditions.includes(text("condition")) || !["draft","active","inactive","sold"].includes(status)) throw new Error("Choose a valid condition and listing status.");
  const expiration = text("expiration");
  if (expiration && (!/^\d{4}-\d{2}-\d{2}$/.test(expiration) || Number.isNaN(Date.parse(expiration)) || new Date(expiration).toISOString().slice(0,10) !== expiration)) throw new Error("Enter a valid expiration date or leave it blank.");
  if (text("packaging").length > 200 || text("notes").length > 2000) throw new Error("Packaging is limited to 200 characters and notes to 2,000.");
  if (text("procedure_type") && !procedures.includes(text("procedure_type"))) throw new Error("Choose a valid procedure type.");
  if(text("inventory_kind") && !["capital","disposable","unclassified"].includes(text("inventory_kind"))) throw new Error("Choose capital equipment or disposable supplies.");
  return { inventory_kind:text("inventory_kind") || "unclassified", price_negotiable: text("price_negotiable") === "yes", procedure_type: text("procedure_type") || "Other", quantity, quantity_unit: unit, units_per_package: units, price_usd: price, condition: text("condition"),
    expiration, sterile: text("sterile") === "yes", single_use: text("single_use") === "yes", packaging: text("packaging"), notes: text("notes"), status };
}
