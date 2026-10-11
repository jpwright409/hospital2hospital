"use client";
import Link from "next/link";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <div className="container page-section"><div className="panel"><h1>Unable to load this page</h1>
    <p className="error" role="alert">Retry the request. In connected mode, check your Supabase URL, publishable key, service status, and ensure all versioned migrations have been applied. Refresh the Supabase schema cache after migration changes. The application has not switched to demo mode.</p>
    <button className="button primary" onClick={reset}>Try again</button><Link className="button secondary" href="/auth/login">Log in again</Link>
    <Link className="button secondary" href="/marketplace">Browse marketplace</Link></div></div>;
}
