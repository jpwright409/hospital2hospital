import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireUser,serviceError } from "@/lib/auth/server";
import { OnboardingForm } from "@/components/account-forms";
export default async function Page() {
  const {supabase}=await requireUser();
  const declaration=await supabase.rpc("my_registration_declaration");
  if(declaration.error)throw new Error(serviceError(declaration.error));
  return <div className="container page-section form-container"><Link className="text-link" href="/account">← Your account</Link>
    <div className="page-heading"><span className="eyebrow">FACILITY ONBOARDING</span><h1>Submit your facility</h1><p>Provide facility details for administrator review. New facilities always start pending.</p></div>
    <section className="panel"><OnboardingForm requestId={randomUUID()} npi={declaration.data?.facility_npi??""}/></section>
  </div>;
}
