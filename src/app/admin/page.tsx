import {redirect} from "next/navigation";
import {requirePlatformAdministrator} from "@/lib/auth/server";
export default async function Page(){
  await requirePlatformAdministrator();
  redirect("/admin/facilities");
}
