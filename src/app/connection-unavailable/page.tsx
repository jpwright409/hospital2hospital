import Link from "next/link";
export default function Page() {
  return <div className="container page-section auth-container"><div className="panel"><h1>Service connection unavailable</h1>
    <p className="error" role="alert">Connected mode remains enabled. Check the Supabase URL and publishable key, network availability, and project status. Restart after changing environment variables.</p>
    <p>No fictional inventory, demo account, or demo permissions have been substituted.</p><Link href="/account" className="button primary">Retry account connection</Link>
    <Link href="/marketplace" className="button secondary">Retry marketplace</Link></div></div>;
}
