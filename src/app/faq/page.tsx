import Link from "next/link";
const questions=[
 ["Does it cost anything?","Hospital2Hospital has no listing fees or transaction fees. There are no shopping carts or platform payments."],
 ["How does facility approval work?","Register with a work email, confirm it, and submit your facility. A platform administrator reviews the facility before inventory management and buyer inquiries become available."],
 ["Can I list a product missing from the catalog?","Yes. Choose Propose a new reference product, enter manufacturer, catalog/SKU, product type and description, and provide your facility's actual stock. Matching manufacturer/catalog references are reused without overwriting shared product data."],
 ["Can a price be negotiable?","Yes. Sellers can mark an asking price negotiable, including a zero asking price, and discuss offers directly with the buyer."],
 ["What happens when I contact a seller?","Eligible members of an approved buyer facility can start or open a private shared facility conversation. A seller may also explicitly share a designated business contact with approved buyers. Personal account and backup contact information stays private."],
 ["Can I reactivate a listing?","Yes. Deactivation and marking sold retain the listing for later reactivation; verify current quantities before republishing. Delete listing is a separate withdrawal that cannot be reactivated and preserves conversation history."],
 ["What is the difference between saves and watchlists?","Saves notify you in the app when an existing saved listing changes. Watchlists match newly posted listings using your filters; email alerts are optional and require configured delivery."],
 ["Can I upload item photos?","Yes. Sellers may upload up to six JPEG, PNG or WebP images per listing, up to 5 MB each. Upload photos of the actual item; stock images are not required."],
 ["Does an invitation approve a facility or add a colleague to mine?","No. Referral emails invite someone to register. Normal email confirmation, onboarding and facility approval still apply; referrals grant no membership or permissions."],
 ["How should facilities verify an item?","Confirm the catalog identity, condition, packaging, quantity, expiration and suitability directly with the seller and manufacturer before making arrangements."],
];
export default function Page() {return <div className="container page-section conversation-container"><h1>Frequently asked questions</h1><p>How the current marketplace works.</p>{questions.map(([q,a])=><details className="panel" key={q}><summary><strong>{q}</strong></summary><p>{a}</p></details>)}<p className="notice">Initial operational FAQ. Owner-written policy and support details are still to be supplied.</p><Link href="/about">About Hospital2Hospital</Link></div>;}
