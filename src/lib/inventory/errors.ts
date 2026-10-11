import "server-only";
import { serviceError } from "@/lib/auth/server";
export function inventoryError(error: unknown) {
  const e = error as {code?: string};
  if (["23514","23502","22P02","22003","22007","22008"].includes(e.code ?? "")) return "Check required product fields, whole quantities, package size, USD price, and expiration date, then retry.";
  return serviceError(error).replaceAll("Account database", "Inventory database").replaceAll("Account service", "Inventory service");
}
