"use server";
import { revalidatePath } from "next/cache";
import { requireUser, serviceError } from "@/lib/auth/server";
import { validUuid } from "@/lib/auth/policy";
import type { ActionState } from "./auth/actions";

export async function markListingUpdatesRead(_state: ActionState, form: FormData): Promise<ActionState> {
  const ids = form.getAll("notification_id").map(String);
  if (!ids.length || ids.length > 100 || !ids.every(validUuid)) return { error: "Select valid notifications, then retry." };
  const { supabase } = await requireUser();
  const { error } = await supabase.rpc("mark_saved_listing_updates_read", { p_ids: ids });
  if (error) return { error: serviceError(error) };
  revalidatePath("/notifications");
  return { success: "Listing updates marked as read." };
}
