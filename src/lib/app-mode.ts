export type AppMode = "demo" | "connected";

export function getAppMode(): AppMode {
  const mode = process.env.NEXT_PUBLIC_APP_MODE ?? "demo";
  if (mode !== "demo" && mode !== "connected") {
    throw new Error("Set NEXT_PUBLIC_APP_MODE to demo or connected, then restart the application.");
  }
  return mode;
}

export function assertDemoMutationAllowed() {
  if (getAppMode() === "connected") {
    throw new Error("Demo inventory changes and inquiries are disabled in connected mode. Use Supabase inventory; messaging is not yet available.");
  }
}

export function getSupabaseConfig() {
  if (getAppMode() !== "connected") {
    throw new Error("Account features require connected mode. See SUPABASE_SETUP.md.");
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key || !/^https?:\/\//.test(url)) {
    throw new Error("Connected mode requires a valid Supabase project URL and publishable key. Check .env.local and restart the application.");
  }
  return { url, key };
}

export function getSiteUrl() {
  const value = process.env.NEXT_PUBLIC_SITE_URL;
  if (!value) throw new Error("Set NEXT_PUBLIC_SITE_URL to this application's origin, then restart.");
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("NEXT_PUBLIC_SITE_URL must be an http(s) origin without a path, query, or fragment.");
  }
  return url.origin;
}
