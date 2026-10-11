import Link from "next/link";
import { randomUUID } from "node:crypto";
import { getAppMode } from "@/lib/app-mode";
import { loadAccount } from "@/lib/auth/server";
import { emailDeliveryConfigured } from "@/lib/email-config";
import { ReferralForm } from "@/components/community-forms";
export default async function Page() {
 if(getAppMode()==="demo") return <div className="container page-section"><h1>Refer a facility</h1><p>Real invitations require connected mode and configured email delivery. No demo email is sent.</p></div>;
 const account=await loadAccount();return <div className="container page-section form-container"><h1>Refer a facility</h1><p>Invite a colleague to Hospital2Hospital&apos;s no-cost marketplace.</p>{account.active && account.capabilities.canInquire ? <ReferralForm id={randomUUID()} facilityId={account.active.id} facilityName={account.active.name} emailReady={emailDeliveryConfigured()}/> : <p className="notice">Select an approved facility with an eligible membership in <Link href="/account">My account</Link>.</p>}</div>;
}
