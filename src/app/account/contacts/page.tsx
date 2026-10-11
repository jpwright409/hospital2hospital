import Link from "next/link";
import { loadAccount,serviceError } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { FacilityContactForm } from "@/components/facility-contact-form";
export default async function Page() {
 const account=await loadAccount();const client=await createClient();
 if(!account.active) return <div className="container page-section"><h1>Facility contacts</h1><Link href="/account">Select a facility</Link></div>;
 const permission=await client.rpc("can_manage_facility_contacts",{p_id:account.active.id});if(permission.error) throw new Error(serviceError(permission.error));
 if(!permission.data) return <div className="container page-section"><h1>Facility contacts</h1><p className="notice">An active owner or facility administrator membership is required.</p></div>;
 const result=await client.from("facility_contacts").select("business_name,business_email,business_phone,secondary_name,secondary_email,secondary_phone,share_business_contact").eq("facility_id",account.active.id).maybeSingle();
 if(result.error) throw new Error(serviceError(result.error));
 return <div className="container page-section form-container"><h1>{account.active.name}: contacts</h1><FacilityContactForm key={account.active.id} facilityId={account.active.id} contact={result.data??{}}/></div>;
}
