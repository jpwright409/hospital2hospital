import { AccountWorkspace } from "@/components/account-pages";
export default async function Page({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  const { notice } = await searchParams;
  const messages: Record<string, string> = { onboarded: "Facility submitted. Its approval status is pending.", "administrator-required": "Platform administrator access is required for the approval screen. Facility ownership does not grant that access." };
  return <AccountWorkspace notice={messages[notice ?? ""]}/>;
}
