"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { authenticatedClient, serviceError } from "@/lib/auth/server";
import { getSiteUrl } from "@/lib/app-mode";
import { validUuid } from "@/lib/auth/policy";

export type ActionState = { error?: string; success?: string };
const value = (form: FormData, field: string) => String(form.get(field) ?? "").trim();
const emailValid = (email: string) => email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
const passwordValid = (password: string) => password.length >= 12 && password.length <= 128;

export async function register(_previous: ActionState, form: FormData): Promise<ActionState> {
  const email = value(form, "email");
  const password = String(form.get("password") ?? "");
  const name = value(form, "display_name");
  if (!emailValid(email) || name.length < 2 || name.length > 120 || !passwordValid(password)) {
    return { error: "Enter your name, a valid email, and a password of 12–128 characters." };
  }
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signUp({ email, password, options: {
      data: { display_name: name }, emailRedirectTo: `${getSiteUrl()}/auth/callback`,
    } });
    if (error) return { error: serviceError(error) };
    return { success: "Check your email to confirm your account, then log in. If you already have an account, use login or password recovery." };
  } catch (error) { return { error: serviceError(error) }; }
}

export async function login(_previous: ActionState, form: FormData): Promise<ActionState> {
  const email = value(form, "email");
  const password = String(form.get("password") ?? "");
  if (!emailValid(email) || !password || password.length > 128) return { error: "Enter a valid email and password." };
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: serviceError(error) };
  } catch (error) { return { error: serviceError(error) }; }
  revalidatePath("/", "layout");
  redirect("/marketplace");
}

export async function logout(_previous: ActionState, _form: FormData): Promise<ActionState> {
  void _previous; void _form;
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signOut();
    if (error) return { error: serviceError(error) };
  } catch (error) { return { error: serviceError(error) }; }
  revalidatePath("/", "layout");
  redirect("/auth/login?notice=signed-out");
}

export async function forgotPassword(_previous: ActionState, form: FormData): Promise<ActionState> {
  const email = value(form, "email");
  if (!emailValid(email)) return { error: "Enter a valid email address." };
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${getSiteUrl()}/auth/recovery` });
    if (error) return { error: serviceError(error) };
    return { success: "If an account exists for this email, a recovery link has been requested. Check your inbox and spam folder." };
  } catch (error) { return { error: serviceError(error) }; }
}

export async function resendConfirmation(_previous: ActionState, form: FormData): Promise<ActionState> {
  const email = value(form, "email");
  if (!emailValid(email)) return { error: "Enter a valid email address." };
  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.resend({ type: "signup", email, options: { emailRedirectTo: `${getSiteUrl()}/auth/callback` } });
    if (error && error.code !== "email_already_confirmed") return { error: serviceError(error) };
    return { success: "If this account needs confirmation, a new confirmation email has been requested. Otherwise, use login or password recovery." };
  } catch (error) { return { error: serviceError(error) }; }
}

export async function updatePassword(_previous: ActionState, form: FormData): Promise<ActionState> {
  const password = String(form.get("password") ?? "");
  if (!passwordValid(password) || password !== String(form.get("confirm_password") ?? "")) {
    return { error: "Use matching passwords of 12–128 characters." };
  }
  try {
    const { supabase, user } = await authenticatedClient();
    if (!user || !user.email_confirmed_at) return { error: "Your recovery session has expired. Request a new recovery link or log in again." };
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { error: serviceError(error) };
    return { success: "Password updated. You can continue to your account or log out and test your new password." };
  } catch (error) { return { error: serviceError(error) }; }
}

export async function onboardFacility(_previous: ActionState, form: FormData): Promise<ActionState> {
  const name = value(form, "name"); const city = value(form, "city");
  const state = value(form, "state").toUpperCase(); const type = value(form, "facility_type");
  const requestId = value(form, "request_id");
  if (name.length < 2 || name.length > 160 || city.length < 2 || city.length > 100 || !/^[A-Z]{2}$/.test(state) || !["hospital", "surgery_center", "surgical_hospital", "physician_office", "other"].includes(type) || !validUuid(requestId)) {
    return { error: "Enter a facility name, city, two-letter state, and facility type. Refresh the page if this form has expired." };
  }
  try {
    const { supabase, user } = await authenticatedClient();
    if (!user || !user.email_confirmed_at) return { error: "Log in with a confirmed account before onboarding a facility." };
    const { error } = await supabase.rpc("onboard_facility_with_contacts", { p_name: name, p_city: city, p_state: state, p_facility_type: type, p_request_id: requestId, p_contact: {secondary_name:value(form,"secondary_name"),secondary_email:value(form,"secondary_email"),secondary_phone:value(form,"secondary_phone")} });
    if (error) return { error: serviceError(error) };
  } catch (error) { return { error: serviceError(error) }; }
  revalidatePath("/account");
  redirect("/account?notice=onboarded");
}

export async function selectFacility(_previous: ActionState, form: FormData): Promise<ActionState> {
  const id = value(form, "facility_id");
  if (!validUuid(id)) return { error: "Choose a facility." };
  try {
    const { supabase, user } = await authenticatedClient();
    if (!user || !user.email_confirmed_at) return { error: "Your session has expired. Log in again." };
    const { error } = await supabase.rpc("set_active_facility", { p_facility_id: id });
    if (error) return { error: serviceError(error) };
  } catch (error) { return { error: serviceError(error) }; }
  revalidatePath("/", "layout");
  return { success: "Active facility updated. Permissions are evaluated from current membership and approval status." };
}

export async function reviewFacility(_previous: ActionState, form: FormData): Promise<ActionState> {
  const id = value(form, "facility_id"); const status = value(form, "status"); const reason = value(form, "reason");
  if (!validUuid(id) || !["approved", "rejected", "suspended"].includes(status) || reason.length > 1000 || (status !== "approved" && reason.length < 10)) {
    return { error: "Choose a valid decision. Rejection and suspension require a reason of 10–1000 characters." };
  }
  try {
    const { supabase, user } = await authenticatedClient();
    if (!user || !user.email_confirmed_at) return { error: "Log in again before reviewing facilities." };
    const permission = await supabase.rpc("is_platform_administrator");
    if (permission.error) return { error: serviceError(permission.error) };
    if (permission.data !== true) return { error: "Platform administrator permission is required. Facility ownership does not grant this permission." };
    const { error } = await supabase.rpc("review_facility", { p_facility_id: id, p_status: status, p_reason: reason || null });
    if (error) return { error: serviceError(error) };
  } catch (error) { return { error: serviceError(error) }; }
  revalidatePath("/admin/facilities"); revalidatePath("/account"); revalidatePath("/dashboard");
  return { success: "Facility decision saved and audited." };
}
