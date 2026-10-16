import Link from "next/link";
import type {ReactNode} from "react";
import {requirePlatformAdministrator} from "@/lib/auth/server";
import {FacilitatorTabs} from "@/components/facilitator-tabs";

export default async function AdminLayout({children}:{children:ReactNode}){
  await requirePlatformAdministrator();
  // Each section and mutation also authorizes independently: layouts persist
  // across client navigation and are not the sole authorization boundary.
  return <div className="facilitator-dashboard"><div className="container facilitator-heading"><Link className="text-link" href="/account">← My account</Link><h1>Facilitator Dashboard</h1><p>Review facilities, catalog products, featured listings and support requests.</p><FacilitatorTabs/></div>{children}</div>;
}
