import Link from "next/link";
import { getAppMode } from "@/lib/app-mode";
import { loadAccount, serviceError } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import Image from "next/image";
import { AuthForm, FacilitySelection, LogoutForm } from "./account-forms";
import fullLogo from "../../public/brand/Full Main Logo.png";

export function WelcomeLogin({ kind = "login" }: { kind?: "login" | "register" | "forgot" | "resend" }) {
  const titles = { login: "Welcome back!", register: "Create your facility account", forgot: "Recover your account", resend: "Confirm your email" };
  const descriptions = { login: "Sign in to find your next essential.", register: "Confirm your work email, then submit your facility for approval.", forgot: "Request a secure email link to reset your password.", resend: "Request a new confirmation link if yours expired or did not arrive." };
  return <div className="welcome-login">
    <Image className="welcome-logo" src={fullLogo} alt="Hospital2Hospital — Better connections. Less waste." sizes="(max-width: 600px) 90vw, 520px" preload/>
    <section className="panel welcome-card" aria-labelledby="welcome-title">
      <h1 id="welcome-title">{titles[kind]}</h1>
      <p className="welcome-description">{descriptions[kind]}</p>
      <AuthForm key={kind} kind={kind} welcome/>
    </section>
  </div>;
}

export function AuthenticationPage({ kind, notice }: { kind: "login" | "register" | "forgot" | "update" | "resend"; notice?: string }) {
  const titles = { login: "Welcome back", register: "Create your facility account", forgot: "Recover your account", update: "Set a new password", resend: "Confirm your email" };
  const descriptions = {
    login: "Log in to manage your facility and approval status.",
    register: "Confirm your work email, then submit your facility for approval.",
    forgot: "Request a secure email link to reset your password.",
    update: "Your account must have a valid authenticated session to change its password.",
    resend: "Request a new confirmation link if yours expired or did not arrive.",
  };
  return <div className="container page-section auth-container">
    <div className="page-heading">{kind !== "login" && <span className="eyebrow">HOSPITAL2HOSPITAL ACCOUNTS</span>}<h1>{titles[kind]}</h1><p>{descriptions[kind]}</p></div>
    {getAppMode() === "demo" ? <div className="panel"><h2>Account features are not configured</h2><p>This application is explicitly in demo mode. Configure connected mode using SUPABASE_SETUP.md to test accounts.</p><Link className="button primary" href="/marketplace">Browse demo inventory</Link></div>
      : <div className="panel">
        {notice && <p className="notice" role="status">{notice}</p>}
        <AuthForm kind={kind}/>
      </div>}
    <p className="muted account-disclaimer">Approved facility owners and inventory editors can publish actual inventory. Eligible members can use private facility conversations.</p>
  </div>;
}

export async function AccountWorkspace({ notice }: { notice?: string }) {
  const account = await loadAccount();
  const { active, membership, capabilities } = account;
  const client = await createClient();
  const [business, avatar] = await Promise.all([
    client.rpc("my_active_facility_business_contact"),
    client.from("profile_avatars").select("image_data").eq("user_id", account.user.id).maybeSingle(),
  ]);
  const contact = business.data as { name: string; email: string; phone: string } | null;
  return <div className="container page-section">
    <div className="section-heading"><div className="page-heading"><span className="eyebrow">CONNECTED ACCOUNT</span>
      <h1>Your facility workspace</h1><div className="account-identity">{avatar.data?.image_data && <Image src={avatar.data.image_data} alt="Your profile headshot" width={64} height={64} unoptimized/>}<p>{account.profile.display_name || "Your account"} · {account.user.email}</p></div>
      {business.error || avatar.error ? <p className="error" role="alert">{serviceError(business.error ?? avatar.error)}</p> : active && <div className="account-business-contact"><strong>{active.name} business contact</strong>{contact && (contact.name || contact.email || contact.phone) ? <p>{contact.name && <span>{contact.name}</span>}{contact.email && <a href={`mailto:${contact.email}`}>{contact.email}</a>}{contact.phone && <span>{contact.phone}</span>}</p> : <p>No designated business contact has been added. A facility owner or administrator can add one in Manage facility contacts.</p>}</div>}
      </div><LogoutForm/></div>
    {notice && <p className="notice" role="status">{notice}</p>}
    <div className="account-grid">
      <section className="panel"><h2>Active facility</h2>
        {account.facilities.length ? <FacilitySelection key={account.profile.active_facility_id ?? "none"} facilities={account.facilities} activeId={account.profile.active_facility_id}/>
          : <><p>You have no active facility memberships. Submit your facility to begin onboarding.</p><Link href="/account/onboarding" className="button primary">Onboard a facility</Link></>}
        {active ? <div className="facility-status"><h3>{active.name}</h3><p>{active.city}, {active.state} · {({hospital:"Hospital",surgery_center:"Surgery center",surgical_hospital:"Surgical hospital",physician_office:"Physician office",other:"Other"})[active.facility_type]}</p>
          <span className={`badge status-${active.status}`}>{active.status}</span><p>Your membership: {membership?.role}</p>
          {active.status === "pending" && <p>Your submission is complete and awaiting platform administrator review. You can view your status; publishing and inquiries require approval.</p>}
          {active.status === "approved" && <p>Your facility is approved. Active owners and inventory editors can manage inventory. Owners, facility administrators, and inventory editors can use the private inbox.</p>}
          {active.status === "suspended" && <p>Your facility is suspended. Publishing and inquiry permissions are disabled. Contact your platform administrator about reinstatement.</p>}
          {active.status === "rejected" && <p>Your facility was not approved. Contact your platform administrator to resolve the review findings.</p>}
          {active.review_reason && <p><strong>Review reason:</strong> {active.review_reason}</p>}
          <dl className="specs"><div><dt>Inventory publishing permission</dt><dd>{capabilities.canPublish ? "Available" : "Not eligible"}</dd></div>
            <div><dt>Private conversation permission</dt><dd>{capabilities.canInquire ? "Available" : "Not eligible"}</dd></div></dl>
        </div> : account.facilities.length > 0 && <p className="notice">Select a facility. An inaccessible or revoked selection does not grant permission.</p>}
      </section>
      <section className="panel"><h2>Account actions</h2><div className="account-links vertical">
        <Link href="/account/contacts">Manage facility contacts</Link><Link href="/watchlist">Manage watchlists</Link><Link href="/refer">Refer a facility</Link><Link href="/dashboard">Manage facility inventory</Link><Link href="/inbox">Facility inbox</Link><Link href="/account/onboarding">Onboard another facility</Link><Link href="/auth/update-password">Update password</Link>
        <Link href="/marketplace">Browse marketplace</Link><Link href="/saved">View private saved listings</Link>
        {account.isPlatformAdministrator && <><Link href="/admin/facilities">Platform facility approvals</Link><Link href="/admin/featured">Featured listing review</Link><Link href="/admin/support">Platform support tickets</Link></>}
      </div><p>Facility ownership and platform administration are separate permissions. No account is automatically promoted.</p></section>
    </div>
    <p className="notice">Connected inventory and private saved listings use Supabase. Demo stock is never used after a connection failure. Listing photos and private conversations are connected; watchlist email alerts are optional and require configured delivery.</p>
  </div>;
}

