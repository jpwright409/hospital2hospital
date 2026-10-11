"use server";
import { revalidatePath } from "next/cache";
import { authenticatedClient, serviceError } from "@/lib/auth/server";
import { getAppMode } from "@/lib/app-mode";
import { validUuid } from "@/lib/auth/policy";
import type { ActionState } from "./auth/actions";
export async function submitBoost(_state: ActionState, form: FormData): Promise<ActionState> {
 if (getAppMode() !== "connected") return { error: "Boost review requires a connected account." };
 const listing = String(form.get("listing_id") ?? "");const facility = String(form.get("facility_id") ?? "");
 if (!validUuid(listing) || !validUuid(facility)) return { error: "Choose an eligible facility and active listing." };
 try {
  const { supabase, user } = await authenticatedClient();
  if (!user?.email_confirmed_at) return { error: "Log in with a confirmed account." };
  const row = await supabase.from("marketplace_inventory").select("facility_id").eq("id",listing).maybeSingle();
  if (row.error) return { error: serviceError(row.error) };
  if (row.data?.facility_id !== facility) return { error: "This listing does not belong to the selected facility. Refresh and try again." };
  const result = await supabase.rpc("request_listing_boost", { p_listing_id: listing });
  if (result.error) return { error: serviceError(result.error) };
  revalidatePath("/dashboard"); revalidatePath("/admin/featured");
  return { success: "Listing submitted for administrator review. Boosting is free; submitting does not guarantee placement. Existing pending or approved requests are not duplicated." };
 } catch (error) { return { error: serviceError(error) }; }
}
export async function reviewBoost(_state: ActionState, form: FormData): Promise<ActionState> {
 const id = String(form.get("id") ?? "");const revision = Number(form.get("revision"));const decision = String(form.get("decision"));
 const slot = Number(form.get("slot"));const note = String(form.get("note") ?? "").trim();
 if (!validUuid(id) || !Number.isSafeInteger(revision) || revision < 1 || !["approved","rejected","ended"].includes(decision) || (decision === "approved" && ![1,2].includes(slot)) || note.length > 1000) return { error: "Choose a valid decision and slot." };
 try {
  const { supabase, user } = await authenticatedClient();
  if (!user?.email_confirmed_at) return { error: "Log in with a confirmed account." };
  const result = await supabase.rpc("review_listing_boost", { p_id:id,p_revision:revision,p_decision:decision,p_slot:decision === "approved" ? slot : null,p_note:note });
  if (result.error) return { error: serviceError(result.error) };
  revalidatePath("/admin/featured"); revalidatePath("/marketplace"); revalidatePath("/dashboard");
  return { success: "Featured listing decision saved." };
 } catch (error) { return { error: serviceError(error) }; }
}
