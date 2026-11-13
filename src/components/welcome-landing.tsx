import Image from "next/image";
import Link from "next/link";
import fullLogo from "../../public/brand/Full Main Logo.png";

export function WelcomeLanding() {
 return <>
  <nav className="welcome-navigation" aria-label="Welcome navigation"><Link href="/about">About H2H</Link><Link className="button secondary" href="/?welcome=login">Log in</Link></nav>
  <section className="welcome-introduction" aria-labelledby="welcome-introduction-title">
   <Image className="welcome-logo" src={fullLogo} alt="Hospital2Hospital — Better connections. Less waste." sizes="(max-width: 600px) 90vw, 520px" preload/>
   <h1 id="welcome-introduction-title">Better connections for your facility.</h1>
   <p>A free marketplace where hospitals and surgery centers connect to find essential supplies and equipment, share surplus inventory, and reduce waste.</p>
   <div className="welcome-introduction-actions"><Link className="button primary" href="/?welcome=register">Get started</Link><Link href="#what-is-h2h">Explore the marketplace below ↓</Link></div>
  </section>
  <section className="welcome-benefits" aria-label="How Hospital2Hospital helps your facility">
   <article><h2>Find your next essential</h2><p>Explore surgical supplies and equipment listed by approved healthcare facilities.</p></article>
   <article><h2>Give surplus a second life</h2><p>Share your facility’s excess inventory and help reduce unnecessary waste.</p></article>
   <article><h2>Connect directly</h2><p>Coordinate with other facilities through private conversations, with no listing fees or subscriptions.</p></article>
  </section>
 </>;
}
