import { authenticatedClient, serviceError } from "@/lib/auth/server";
import { getAppMode } from "@/lib/app-mode";

export async function GET() {
  const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
  try {
    if (getAppMode() !== "connected") return Response.json({ facilities: [], listingUpdates: 0 }, { headers });
    const { supabase, user } = await authenticatedClient();
    if (!user || !user.email_confirmed_at) return Response.json({ facilities: [], listingUpdates: 0 }, { headers });
    const [messages, updates] = await Promise.all([
      supabase.rpc("my_message_facilities"), supabase.rpc("my_saved_listing_update_count"),
    ]);
    if (messages.error || updates.error) return Response.json({ error: serviceError(messages.error ?? updates.error) }, { status: 503, headers });
    return Response.json({ facilities: messages.data, listingUpdates: Number(updates.data) }, { headers });
  } catch (error) {
    return Response.json({ error: serviceError(error) }, { status: 503, headers });
  }
}
