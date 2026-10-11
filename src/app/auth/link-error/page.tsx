import Link from "next/link";
export default async function Page({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const { reason } = await searchParams;
  const message = reason === "connection" ? "The account service could not be reached. Check the connection and request a new link. Connected mode remains enabled."
    : reason === "disabled" ? "Account callbacks require connected mode. Follow SUPABASE_SETUP.md to configure it."
      : "This email link is invalid, expired, already used, or missing the required browser session. Request a new recovery link, or use login after confirming your email.";
  return <div className="container page-section auth-container"><div className="panel"><h1>Email link unavailable</h1><p className="error" role="alert">{message}</p>
    <div className="account-links"><Link href="/auth/forgot-password">Request a recovery link</Link><Link href="/auth/resend-confirmation">Resend confirmation</Link><Link href="/auth/login">Log in</Link></div></div></div>;
}
