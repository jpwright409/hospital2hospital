import Link from "next/link";
import content from "@/lib/owner-content.json";
export default function Page() {
 return <div className="container page-section conversation-container owner-content-page"><h1>Frequently asked questions</h1>
 {content.faq.map(({question,answer})=><details className="panel" key={question}><summary><strong>{question}</strong></summary><p>{answer}</p></details>)}
 <Link className="button secondary" href="/about">About Hospital2Hospital</Link></div>;
}
