import { authenticatedClient, serviceError } from "@/lib/auth/server";
import { getAppMode } from "@/lib/app-mode";
export async function GET() {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  try {
    if (getAppMode() !== "connected") return Response.json({ profile: null }, { headers });
    const { supabase, user } = await authenticatedClient();
    if (!user?.email_confirmed_at) return Response.json({ profile: null }, { status: 401, headers });
    const [profile, avatar] = await Promise.all([
      supabase.from("profiles").select("display_name").eq("id", user.id).single(),
      supabase.from("profile_avatars").select("image_data").eq("user_id", user.id).maybeSingle(),
    ]);
    if (profile.error || avatar.error) return Response.json({ error: serviceError(profile.error ?? avatar.error) }, { status: 503, headers });
    return Response.json({ profile: { name: profile.data.display_name, email: user.email ?? "", avatar: avatar.data?.image_data ?? null } }, { headers });
  } catch (error) { return Response.json({ error: serviceError(error) }, { status: 503, headers }); }
}
