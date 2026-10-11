import { DemoData, Inquiry, Listing, Product, productKey, seed, sellerId } from "./data";
import { assertDemoMutationAllowed, getAppMode } from "./app-mode";

// Demo-only synchronous adapter. Connected inventory uses inventory/server.ts
// and transactional database RPCs; this adapter never substitutes remote data.
export interface MarketplaceRepository {
 getSnapshot(): DemoData;
 subscribe(listener: () => void): () => void;
 saveListing(product: Omit<Product, "id">, listing: Omit<Listing, "id" | "productId" | "facilityId" | "createdAt">, id?: string): string;
 toggleSaved(id: string): void;
 setStatus(id: string, status: Listing["status"]): void;
 addInquiry(id: string, message: string): void;
 reset(): void;
}
const key = "hospital2hospital.demo.v1";
let snapshot: DemoData | undefined;
const listeners = new Set<() => void>();
function read(): DemoData {
 if (getAppMode() !== "demo") throw new Error("Demo inventory is unavailable in connected mode. Use Supabase inventory.");
 if (snapshot) return snapshot;
 try {
  const raw = localStorage.getItem(key);
  if (raw) {
   const parsed = JSON.parse(raw) as DemoData;
   if (parsed.version === 1 && [parsed.products, parsed.facilities, parsed.listings, parsed.saved, parsed.inquiries].every(Array.isArray)) {
    snapshot = parsed;
    return snapshot;
   }
  }
 } catch { /* A restricted browser can still render seed data. Writes report errors. */ }
 snapshot = structuredClone(seed);
 return snapshot;
}
function commit(next: DemoData) {
 try { localStorage.setItem(key, JSON.stringify(next)); }
 catch { throw new Error("Could not save to browser storage. Enable local storage and try again."); }
 snapshot = next;
 listeners.forEach(listener => listener());
}
function ownListing(id: string) {
 const listing = read().listings.find(l => l.id === id);
 if (!listing || listing.facilityId !== sellerId) throw new Error("This listing does not belong to your demo facility.");
 return listing;
}
export const repository: MarketplaceRepository = {
 getSnapshot: read,
 subscribe(listener) {
  listeners.add(listener);
  const sync = (event: StorageEvent) => { if (event.key === key || event.key === null) { snapshot = undefined; listeners.forEach(l => l()); } };
  window.addEventListener("storage", sync);
  return () => { listeners.delete(listener); window.removeEventListener("storage", sync); };
 },
 saveListing(input, details, id) {
  assertDemoMutationAllowed();
  if (id) ownListing(id);
  if (!input.manufacturer.trim() || !input.catalogNumber.trim() || !input.name.trim() || !input.category || !Number.isInteger(details.quantity) || details.quantity < 1 || !Number.isFinite(details.price) || details.price < 0) throw new Error("Enter a product identity, whole quantity, and valid asking price.");
  if (details.expiration && (!/^\d{4}-\d{2}-\d{2}$/.test(details.expiration) || details.expiration < new Date().toISOString().slice(0,10))) throw new Error("Expiration must be today or later, or left blank when not applicable.");
  const data = read();
  const productId = productKey(input.manufacturer, input.catalogNumber);
  const existing = data.products.find(p => p.id === productId);
  const listingId = id ?? crypto.randomUUID();
  const previous = data.listings.find(l => l.id === id);
  // Existing canonical products are reused, never overwritten by seller notes.
  const product: Product = { ...input, manufacturer: input.manufacturer.trim(), catalogNumber: input.catalogNumber.trim(), id: productId };
  const listing: Listing = { ...details, id: listingId, productId, facilityId: sellerId, createdAt: previous?.createdAt ?? new Date().toISOString() };
  commit({ ...data, products: existing ? data.products : [...data.products, product], listings: previous ? data.listings.map(l => l.id === id ? listing : l) : [listing, ...data.listings] });
  return listingId;
 },
 toggleSaved(id) {
  assertDemoMutationAllowed();
  const data = read();
  if (!data.listings.some(l => l.id === id)) throw new Error("Listing not found.");
  commit({ ...data, saved: data.saved.includes(id) ? data.saved.filter(s => s !== id) : [...data.saved, id] });
 },
 setStatus(id, status) { assertDemoMutationAllowed(); ownListing(id); const data = read(); commit({ ...data, listings: data.listings.map(l => l.id === id ? { ...l, status } : l) }); },
 addInquiry(id, message) {
  assertDemoMutationAllowed();
  const data = read();
  if (!data.listings.some(l => l.id === id && l.status === "active")) throw new Error("This listing is no longer active.");
  if (!message.trim()) throw new Error("Enter a message.");
  const inquiry: Inquiry = { id: crypto.randomUUID(), listingId: id, message: message.trim(), createdAt: new Date().toISOString() };
  commit({ ...data, inquiries: [inquiry, ...data.inquiries] });
 },
 reset() { assertDemoMutationAllowed(); commit(structuredClone(seed)); },
};
export const serverSnapshot = () => { if (getAppMode() !== "demo") throw new Error("Demo inventory is unavailable in connected mode."); return seed; };
