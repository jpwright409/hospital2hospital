"use client";
import Link from "next/link";
import {usePathname} from "next/navigation";

const tabs=[
  ["/admin/facilities","Facility approvals"],
  ["/admin/products","Product approvals"],
  ["/admin/featured","Featured listing review"],
  ["/admin/support","Support tickets"],
  ["/admin/users","Users"],
];
export function FacilitatorTabs(){
  const path=usePathname();
  return <nav className="facilitator-tabs" aria-label="Facilitator dashboard sections">{tabs.map(([href,label])=><Link key={href} href={href} aria-current={path===href?"page":undefined}>{label}</Link>)}</nav>;
}
