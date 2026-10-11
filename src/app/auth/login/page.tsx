import { AuthenticationPage } from "@/components/account-pages";
export default async function Page({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const messages: Record<string, string> = { confirmation: "Confirm your email before logging in.", "signed-out": "You have been logged out.", confirmed: "Email confirmed. You can log in now." };
  return <AuthenticationPage kind="login" notice={messages[notice ?? ""]}/>;
}
