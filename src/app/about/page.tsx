import Link from "next/link";
import content from "@/lib/owner-content.json";
export default function Page() {
 return <div className="container page-section conversation-container owner-content-page"><h1>About Us</h1>
 {content.about.map(section=><section className="panel" key={section.title}><h2>{section.title}</h2><p>{section.body}</p></section>)}
 <div className="account-links"><Link className="button primary" href="/marketplace">Explore inventory</Link><Link className="button secondary" href="/refer">Refer a facility</Link></div></div>;
}
