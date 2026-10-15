"use client";

import { useActionState, type ReactNode } from "react";
import Link from "next/link";
import { register, login, logout, forgotPassword, resendConfirmation, updatePassword, onboardFacility, selectFacility, reviewFacility, type ActionState } from "@/app/auth/actions";

export function ActionForm({ action, children, submit, className = "" }: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children?: ReactNode; submit: string; className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return <form action={formAction} className={`account-form ${className}`} aria-busy={pending}>
    <fieldset disabled={pending}>{children}</fieldset>
    {state.error && <p className="error" role="alert">{state.error}</p>}
    {state.success && <p className="notice" role="status">{state.success}</p>}
    <button className="button primary" disabled={pending} type="submit">{pending ? "Please wait…" : submit}</button>
  </form>;
}

export function AuthForm({ kind, welcome = false, returnTo }: { kind: "register" | "login" | "forgot" | "update" | "resend"; welcome?: boolean; returnTo?:string }) {
  const password = kind !== "forgot" && kind !== "resend";
  const loginPath = welcome ? "/" : "/auth/login";
  const forgotPath = welcome ? "/?welcome=forgot" : "/auth/forgot-password";
  return <>
    <ActionForm action={{ register, login, forgot: forgotPassword, update: updatePassword, resend: resendConfirmation }[kind]}
      submit={{ register: "Create account", login: "Log in", forgot: "Request recovery link", update: "Update password", resend: "Request confirmation email" }[kind]}>
      {kind === "login" && returnTo && <input type="hidden" name="next" value={returnTo}/> }
      {kind === "register" && <label>Your name<input name="display_name" required minLength={2} maxLength={120} autoComplete="name"/></label>}
      {kind !== "update" && <label>Work email<input name="email" type="email" required maxLength={254} autoComplete="email"/></label>}
      {password && <label>{kind === "update" ? "New password" : "Password"}<input name="password" type="password" required
        minLength={kind === "login" ? 1 : 12} maxLength={128} autoComplete={kind === "login" ? "current-password" : "new-password"}/>
        {kind !== "login" && <small>12–128 characters. Meet any additional Supabase password requirements.</small>}</label>}
      {kind === "update" && <label>Confirm new password<input name="confirm_password" type="password" required minLength={12} maxLength={128} autoComplete="new-password"/></label>}
    </ActionForm>
    <div className="account-links">
      {kind === "login" && <><Link href={forgotPath}>Forgot password?</Link><Link href={welcome ? "/?welcome=register" : "/auth/register"}>Create an account</Link><Link href={welcome ? "/?welcome=resend" : "/auth/resend-confirmation"}>Resend confirmation</Link></>}
      {kind === "register" && <><Link href={loginPath}>Already have an account? Log in</Link><Link href={forgotPath}>Recover an account</Link></>}
      {(kind === "forgot" || kind === "resend") && <Link href={loginPath}>Back to login</Link>}
      {kind === "update" && <Link href="/account">Continue to your account</Link>}
    </div>
  </>;
}

export function LogoutForm() {
  return <ActionForm action={logout} submit="Log out" className="logout-form"/>;
}

export function OnboardingForm({ requestId }: { requestId: string }) {
  return <ActionForm action={onboardFacility} submit="Submit for approval">
    <input type="hidden" name="request_id" value={requestId}/>
    <label>Facility name<input name="name" required minLength={2} maxLength={160} autoComplete="organization"/></label>
    <div className="form-grid"><label>City<input name="city" required minLength={2} maxLength={100} autoComplete="address-level2"/></label>
      <label>State (two-letter code)<input name="state" required pattern="[A-Za-z]{2}" minLength={2} maxLength={2} autoComplete="address-level1"/></label></div>
    <label>Facility type<select name="facility_type"><option value="hospital">Hospital</option><option value="surgery_center">Surgery center</option><option value="surgical_hospital">Surgical hospital</option><option value="physician_office">Physician office</option><option value="other">Other</option></select></label>
    <h3>Secondary facility contact (optional)</h3><label>Name<input name="secondary_name" maxLength={120}/></label><label>Work email<input name="secondary_email" type="email" maxLength={254}/></label><label>Phone<input name="secondary_phone" maxLength={40}/></label><p className="muted">Secondary contact details remain private to facility owners/administrators and grant no account access.</p><p className="muted">You will become this facility’s owner. Its status starts pending. Ownership does not grant platform administrator permissions.</p>
  </ActionForm>;
}

export function FacilitySelection({ facilities, activeId }: { facilities: { id: string; name: string; status: string }[]; activeId: string | null }) {
  return <ActionForm action={selectFacility} submit="Set active facility">
    <label>Active facility<select name="facility_id" required defaultValue={activeId ?? ""}>
      <option value="" disabled>Choose a facility</option>
      {facilities.map(f => <option key={f.id} value={f.id}>{f.name} — {f.status}</option>)}
    </select></label>
  </ActionForm>;
}

export function FacilityReviewForm({ id, status }: { id: string; status: string }) {
  return <ActionForm action={reviewFacility} submit="Save decision">
    <input name="facility_id" type="hidden" value={id}/>
    <label>Decision<select name="status" defaultValue={status === "pending" ? "approved" : status}>
      <option value="approved">Approve</option><option value="rejected">Reject</option><option value="suspended">Suspend</option>
    </select></label>
    <label>Review reason<textarea name="reason" maxLength={1000} placeholder="Required for rejection/suspension (at least 10 characters)."/></label>
  </ActionForm>;
}
