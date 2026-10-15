import { photoReturnPath } from "@/lib/auth/photo-return.mjs";
import { AuthenticationPage } from "@/components/account-pages";
export default async function Page({ searchParams }: { searchParams: Promise<{ notice?: string; next?:string }> }) {
  const { notice, next } = await searchParams;
  const messages: Record<string, string> = { confirmation: "Confirm your email before logging in.", "signed-out": "You have been logged out.", confirmed: "Email confirmed. You can log in now." };
  return <AuthenticationPage kind="login" returnTo={photoReturnPath(next)} notice={messages[notice ?? ""]}/>;
}
