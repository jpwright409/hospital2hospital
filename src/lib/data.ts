export type Product = { id: string; manufacturer: string; catalogNumber: string; name: string; category: string; description: string };
export type Facility = { id: string; name: string; city: string; state: string; type: string };
export type Listing = { id: string; productId: string; facilityId: string; quantity: number; price: number; condition: string; expiration: string; sterile: boolean; singleUse: boolean; packaging: string; notes: string; status: "active" | "inactive"; createdAt: string };
export type Inquiry = { id: string; listingId: string; message: string; createdAt: string };
export type DemoData = { version: 1; products: Product[]; facilities: Facility[]; listings: Listing[]; saved: string[]; inquiries: Inquiry[] };
export const sellerId = "cedar";
export const categories = ["General Surgery", "Orthopedics", "Cardiovascular", "ENT", "Wound Care", "Surgical Equipment"];
export const productKey = (manufacturer: string, catalog: string) => `${manufacturer.trim().toLowerCase()}::${catalog.trim().toLowerCase()}`;
const product = (manufacturer: string, catalogNumber: string, name: string, category: string): Product => ({ id: productKey(manufacturer, catalogNumber), manufacturer, catalogNumber, name, category, description: `${name}. Catalog reference only; specifications and suitability must be confirmed with the manufacturer.` });
const products = [
 product("Ethicon Endo-Surgery", "GST60B", "ECHELON 60mm blue stapler reload", "General Surgery"),
 product("Covidien", "LF1837", "LigaSure blunt tip sealer / divider", "General Surgery"),
 product("Arthrex", "AR-4570", "FiberStitch curved implant", "Orthopedics"),
 product("Ethicon", "1953", "Absorbable hemostat", "Wound Care"),
 product("Teleflex", "ASK-01220-NWM", "Arterial catheterization kit", "Cardiovascular"),
 product("Gyrus ACMI", "130710", "Disposable ventilation tube inserter", "ENT"),
 product("Karl Storz", "11005BC1", "Broncho-Fiberscope", "Surgical Equipment"),
];
export const seed: DemoData = {
 version: 1, products,
 facilities: [
  { id: sellerId, name: "Cedar Grove Surgery Center", city: "Madison", state: "WI", type: "Surgery center" },
  { id: "prairie", name: "Prairie Valley Hospital", city: "Des Moines", state: "IA", type: "Hospital" },
  { id: "lake", name: "Lakeview Regional Hospital", city: "Chicago", state: "IL", type: "Hospital" },
 ],
 listings: [...products, products[0]].map((p, i) => ({ id: `demo-${i + 1}`, productId: p.id, facilityId: [sellerId, "prairie", "lake"][i % 3], quantity: [24, 12, 8, 36, 18, 20, 1, 10][i], price: [85, 175, 120, 38, 55, 22, 1450, 80][i], condition: i === 6 ? "Used — good" : "New / unopened", expiration: i === 6 ? "" : "2028-06-30", sterile: i !== 6, singleUse: i !== 6, packaging: i === 6 ? "Original case" : "Sealed original packaging", notes: "Fictional inventory for prototype testing. No actual stock is offered.", status: "active", createdAt: `2026-10-0${8 - i}T12:00:00Z` })),
 saved: [], inquiries: [],
};
export function matchesProduct(p: Product, query: string) {
 return query.toLowerCase().trim().split(/\s+/).every(token => `${p.name} ${p.manufacturer} ${p.catalogNumber} ${p.category} ${p.description}`.toLowerCase().includes(token));
}
