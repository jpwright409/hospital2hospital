import "server-only";

import { redirect } from "next/navigation";
import { getAppMode } from "@/lib/app-mode";
import { createClient } from "@/lib/supabase/server";
import { facilityCapabilities, type Facility, type Membership } from "./policy";

export function serviceError(error: unknown): string {
  const e = error as { code?: string; message?: string; status?: number };
  if (e.code === "invalid_credentials") return "Email or password is incorrect. Try again or reset your password.";
  if (e.code === "email_not_confirmed") return "Confirm your email before logging in. Check your inbox and spam folder.";
  if (e.code === "over_email_send_rate_limit" || e.status === 429) return "Too many attempts. Wait before trying again; check Supabase email delivery limits.";
  if (["42501", "22023"].includes(e.code ?? "")) return e.message ?? "You do not have permission for this operation.";
  if (e.code === "weak_password") return "Choose a stronger password that meets the project's password policy.";
  if (e.code === "user_already_exists") return "Use login or password recovery for an existing account.";
  if (e.code?.startsWith("PGRST") || e.code === "42P01") return "Account database setup is incomplete. Apply the versioned migrations and refresh the Supabase schema cache.";
  return "Account service unavailable or request unsuccessful. Retry, then check the Supabase URL, publishable key, migrations, and service status. Demo mode has not been enabled.";
}

export async function authenticatedClient() {
  const supabase = await createClient();
  // getUser revalidates with Auth, including account revocation. Never authorize
  // using an unverified cookie/getSession user or user-controlled metadata.
  const { data, error } = await supabase.auth.getUser();
  if (error && error.name !== "AuthSessionMissingError" && error.status !== 400 && error.status !== 401) {
    throw new Error(serviceError(error));
  }
  if(data.user){
    const enabled=await supabase.rpc("account_access_enabled");
    if(enabled.error)throw new Error(serviceError(enabled.error));
    if(enabled.data!==true)redirect("/auth/disabled");
  }
  return { supabase, user: data.user };
}

export async function requireUser() {
  if (getAppMode() === "demo") redirect("/auth/login");
  const account = await authenticatedClient();
  if (!account.user) redirect("/auth/login");
  if (!account.user.email_confirmed_at) redirect("/auth/login?notice=confirmation");
  return { supabase: account.supabase, user: account.user };
}

export async function requirePlatformAdministrator() {
  const account = await requireUser();
  const { data, error } = await account.supabase.rpc("is_platform_administrator");
  if (error) throw new Error(serviceError(error));
  if (data !== true) redirect("/account?notice=administrator-required");
  return account;
}

export async function loadAccount() {
  const { supabase, user } = await requireUser();
  const [profileResult, membershipResult, adminResult] = await Promise.all([
    supabase.from("profiles").select("id, display_name, active_facility_id").eq("id", user.id).single(),
    supabase.from("facility_memberships").select("user_id, facility_id, role, status").eq("user_id", user.id),
    supabase.rpc("is_platform_administrator"),
  ]);
  const queryError = profileResult.error ?? membershipResult.error ?? adminResult.error;
  if (queryError) throw new Error(serviceError(queryError));
  const profile = profileResult.data;
  if (!profile) throw new Error("Account profile not found. Apply the account migrations and their existing-user backfill.");
  const memberships = (membershipResult.data ?? []) as Membership[];
  const ids = memberships.filter(m => m.status === "active").map(m => m.facility_id);
  let facilities: Facility[] = [];
  if (ids.length) {
    const result = await supabase.from("facilities")
      .select("id,name,city,state,facility_type,status,owner_user_id,review_reason,created_at")
      .in("id", ids).order("created_at", { ascending: false });
    if (result.error) throw new Error(serviceError(result.error));
    facilities = result.data as Facility[];
  }
  // Never substitute another facility for a revoked/inaccessible selection.
  const active = facilities.find(f => f.id === profile.active_facility_id) ?? null;
  const membership = memberships.find(m => m.facility_id === active?.id) ?? null;
  // Database helpers evaluate live approval, role, and membership rows.
  let canPublish = false;
  let canInquire = false;
  if (active) {
    const [publish, inquire] = await Promise.all([
      supabase.rpc("facility_can_publish", { p_facility_id: active.id }),
      supabase.rpc("facility_can_inquire", { p_facility_id: active.id }),
    ]);
    if (publish.error || inquire.error) throw new Error(serviceError(publish.error ?? inquire.error));
    canPublish = publish.data === true;
    canInquire = inquire.data === true;
  }
  return {
    user, profile, facilities, memberships, active, membership,
    isPlatformAdministrator: adminResult.data === true,
    capabilities: { ...facilityCapabilities(user.id, active, membership), canPublish, canInquire },
  };
}
