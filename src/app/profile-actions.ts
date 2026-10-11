"use server";
import { revalidatePath } from "next/cache";
import { authenticatedClient, serviceError } from "@/lib/auth/server";
import { getAppMode } from "@/lib/app-mode";
import { validateAvatar } from "@/lib/profile-image";
import type { ActionState } from "./auth/actions";

export async function saveProfile(_previous: ActionState, form: FormData): Promise<ActionState> {
  if (getAppMode() !== "connected") return { error: "Profiles require a connected account." };
  const name = String(form.get("display_name") ?? "").trim();
  if (name.length < 2 || name.length > 120) return { error: "Enter a name of 2-120 characters." };
  try {
    const { supabase, user } = await authenticatedClient();
    if (!user?.email_confirmed_at) return { error: "Your session has expired. Log in with a confirmed account." };
    const file = form.get("avatar");
    const remove = form.get("remove_avatar") === "yes";
    const hasFile = file instanceof File && file.size > 0;
    if (remove && hasFile) return { error: "Choose a replacement headshot or remove the current one." };
    let avatar: string | null = null;
    if (hasFile) {
      if (file.size > 5 * 1024 * 1024) return { error: "Choose a JPEG, PNG, or WebP up to 5 MB." };
      try { avatar = await validateAvatar(new Uint8Array(await file.arrayBuffer())); }
      catch (error) { return { error: (error as Error).message }; }
    }
    const { error } = await supabase.rpc("update_my_profile", { p_name: name, p_replace_avatar: hasFile || remove, p_avatar: avatar });
    if (error) return { error: serviceError(error) };
    revalidatePath("/", "layout");
    return { success: "Profile changes saved." };
  } catch (error) { return { error: serviceError(error) }; }
}
