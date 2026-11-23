import Image from "next/image";
import Link from "next/link";
import fullLogo from "../../public/brand/Full Main Logo.png";

export function WelcomeLanding() {
 return <>
  <nav className="welcome-navigation" aria-label="Welcome navigation"><Link href="/about">About H2H</Link><Link className="button secondary" href="/?welcome=login">Log in</Link></nav>
  <section className="welcome-introduction" aria-labelledby="welcome-introduction-title">
   <Image className="welcome-logo" src={fullLogo} alt="Hospital2Hospital — Verified facilities. Direct trade. Zero fees." sizes="(max-width: 600px) 90vw, 520px" preload/>
   <h1 id="welcome-introduction-title">Where Verified Healthcare Facilities Trade With Each Other – For Free.</h1>
   <p>The Hospital2Hospital marketplace that cuts the middleman and helps you keep more value. List excess inventory or explore – all with no commissions, markups, or subscriptions.</p>
   <div className="welcome-introduction-actions"><Link className="button primary" href="/?welcome=register">Register Your Facility</Link><Link href="#what-is-h2h">Explore the marketplace below ↓</Link></div>
  </section>
  <section className="welcome-benefits" aria-label="How Hospital2Hospital helps your facility">
   <article><h2>Find What You Need … For Less</h2><p>Explore surgical supplies and equipment listed by approved healthcare facilities.</p></article>
   <article><h2>List Excess Inventory</h2><p>Stop getting pennies-on-the-dollar from liquidators. Sell directly to other facilities.</p></article>
   <article><h2>A Trusted Marketplace</h2><p>Communicate directly with other verified healthcare facilities to help lower the cost of healthcare.</p></article>
  </section>
 </>;
}
