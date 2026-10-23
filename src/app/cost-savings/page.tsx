import type {Metadata} from "next";
import Link from "next/link";
import content from "@/lib/resource-content.json";

export const metadata:Metadata={title:"Cost Savings | Hospital2Hospital"};

export default function Page(){
 return <div className="container page-section resource-page">
  <header className="page-heading"><span className="eyebrow">Resources for your facility</span><h1>Cost Savings</h1></header>
  <section className="panel resource-section" aria-labelledby="cost-savings-ideas"><h2 id="cost-savings-ideas">Cost Savings Ideas</h2><p>{content.costSavings}</p></section>
  <div className="account-links"><Link className="button secondary" href="/marketplace">Back to marketplace</Link><Link className="text-link" href="/our-partners">Explore our partners</Link></div>
 </div>;
}
