import Link from "next/link";
import { requirePlatformAdministrator, serviceError } from "@/lib/auth/server";
import { FacilityReviewForm } from "@/components/account-forms";
import type { Facility } from "@/lib/auth/policy";
export default async function Page({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const { supabase } = await requirePlatformAdministrator();
  const params = await searchParams;
  const status = ["pending", "approved", "rejected", "suspended"].includes(params.status ?? "") ? params.status! : "pending";
  const { data, error } = await supabase.from("facilities").select("id,name,city,state,facility_type,status,owner_user_id,review_reason,created_at")
    .eq("status", status).order("created_at", { ascending: false }).limit(100);
  if (error) throw new Error(serviceError(error));
  return <div className="container page-section"><Link className="text-link" href="/account">← Account workspace</Link>
    <div className="page-heading"><span className="eyebrow">PLATFORM ADMINISTRATION</span><h1>Facility approvals</h1><p>Review the newest 100 {status} facilities. Every decision is recorded in the private approval audit.</p></div>
    <nav className="approval-tabs" aria-label="Facility status filters">{["pending", "approved", "rejected", "suspended"].map(s => <Link className={`button ${s === status ? "primary" : "secondary"}`} href={`/admin/facilities?status=${s}`} key={s}>{s}</Link>)}</nav>
    <div className="account-grid">{(data as Facility[]).map(f => <section className="panel" key={f.id}><h2>{f.name}</h2><p>{f.city}, {f.state} · {f.facility_type}</p>
      <span className={`badge status-${f.status}`}>{f.status}</span><p className="muted">Owner account ID: {f.owner_user_id}</p>
      {f.review_reason && <p>Previous reason: {f.review_reason}</p>}
      <FacilityReviewForm id={f.id} status={f.status}/></section>)}</div>
    {!data?.length && <div className="empty"><h2>No {status} facilities</h2><p>New onboarding submissions will appear under Pending.</p></div>}
  </div>;
}
