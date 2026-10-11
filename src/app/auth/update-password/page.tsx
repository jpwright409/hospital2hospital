import { AuthenticationPage } from "@/components/account-pages";
import { requireUser } from "@/lib/auth/server";
export default async function Page() { await requireUser(); return <AuthenticationPage kind="update"/>; }
