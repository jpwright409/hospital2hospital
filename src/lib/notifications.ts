export type ListingUpdate = {
  id: string; listing_id: string; product_name: string; catalog_number: string;
  changes: Record<string, string | number | boolean | null>;
  created_at: string; read_at: string | null; public_available: boolean;
};
export function listingUpdateSummary(changes: ListingUpdate["changes"]): string[] {
  const lines: string[] = [];
  if (changes.status) lines.push(changes.status === "sold" ? "Marked sold" : changes.status === "inactive" ? "Listing deactivated" : "Listing reactivated");
  if (changes.quantity !== undefined) lines.push(`Quantity changed to ${changes.quantity}`);
  if (changes.quantity_unit !== undefined) lines.push(`Quantity unit changed to ${changes.quantity_unit}`);
  if (changes.units_per_package !== undefined) lines.push(`Items per package changed to ${changes.units_per_package}`);
  if (changes.price_usd !== undefined) lines.push(`Price changed to ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(changes.price_usd))} per quantity unit`);
  if (changes.price_negotiable !== undefined) lines.push(changes.price_negotiable ? "Price is now negotiable" : "Price is no longer marked negotiable");
  if (changes.inventory_kind !== undefined) lines.push(`Inventory type changed to ${changes.inventory_kind}`);
  if (changes.procedure_type !== undefined) lines.push(`Procedure changed to ${changes.procedure_type}`);
  if (changes.condition !== undefined) lines.push(`Condition changed to ${changes.condition}`);
  if (changes.expiration !== undefined) lines.push(changes.expiration ? `Expiration changed to ${changes.expiration}` : "Expiration date removed");
  if (["sterile", "single_use", "packaging", "details_updated"].some(key => key in changes)) lines.push("Listing details updated");
  return lines;
}
