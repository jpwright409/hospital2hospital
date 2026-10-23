import type {Metadata} from "next";
import Link from "next/link";
import content from "@/lib/resource-content.json";

export const metadata:Metadata={title:"Our Partners | Hospital2Hospital"};

export default function Page(){
 return <div className="container page-section resource-page">
  <header className="page-heading"><span className="eyebrow">Connections beyond the marketplace</span><h1>Our Partners</h1></header>
  <nav className="resource-section-links" aria-label="Partner sections"><Link href="#dme-partners">DME Partners</Link><Link href="#charity-partners">Charity Partners</Link></nav>
  <section className="panel resource-section" id="dme-partners" aria-labelledby="dme-partners-title"><h2 id="dme-partners-title">DME Partners</h2><p>{content.dmePartners}</p></section>
  <section className="panel resource-section" id="charity-partners" aria-labelledby="charity-partners-title"><h2 id="charity-partners-title">Charity Partners</h2><p>{content.charityPartners}</p></section>
  <div className="account-links"><Link className="button secondary" href="/marketplace">Back to marketplace</Link><Link className="text-link" href="/cost-savings">Ideas to save you money</Link></div>
 </div>;
}
