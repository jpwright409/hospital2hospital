import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getAppMode, getSupabaseConfig } from "@/lib/app-mode";

export async function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  const accountOnly = path.startsWith("/account") || path.startsWith("/admin") || path === "/auth/update-password";
  const protectedRoute = accountOnly || /^\/listings\/[^/]+\/photos$/.test(path) || path.startsWith("/products/") || path.startsWith("/inbox") || path.startsWith("/notifications") || path === "/watchlist" || path === "/refer" || path === "/saved" || path === "/dashboard" || path === "/listings/new" || /^\/listings\/[^/]+\/edit$/.test(path);
  if (getAppMode() === "demo") {
    return accountOnly ? NextResponse.redirect(new URL("/auth/login", request.url)) : NextResponse.next();
  }
  let response = NextResponse.next({ request });
  response.headers.set("Cache-Control", "private, no-store");
  try {
    const { url, key } = getSupabaseConfig();
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          response.headers.set("Cache-Control", "private, no-store");
        },
      },
    });
    const { data, error } = await supabase.auth.getClaims();
    if (error && error.status !== 400 && error.status !== 401 && error.name !== "AuthSessionMissingError") {
      throw error;
    }
    if (protectedRoute && !data?.claims) {
      const login = new URL("/auth/login", request.url);
      if (/^\/listings\/[^/]+\/photos$/.test(path)) login.searchParams.set("next",path);
      const redirect = NextResponse.redirect(login);
      response.cookies.getAll().forEach(cookie => redirect.cookies.set(cookie));
      redirect.headers.set("Cache-Control", "private, no-store");
      return redirect;
    }
    return response;
  } catch {
    // Fail closed. Public demo browsing is a separate, explicitly labeled route.
    const failed = NextResponse.rewrite(new URL("/connection-unavailable", request.url), { status: 503 });
    response.cookies.getAll().forEach(cookie => failed.cookies.set(cookie));
    failed.headers.set("Cache-Control", "private, no-store");
    return failed;
  }
}

export const config = {
  matcher: ["/", "/marketplace", "/saved", "/inbox/:path*", "/notifications/:path*", "/watchlist", "/refer", "/help", "/listings/:id", "/auth/:path*", "/account/:path*", "/admin/:path*", "/dashboard", "/listings/new", "/listings/:id/edit", "/listings/:id/photos", "/products/:path*"],
};
