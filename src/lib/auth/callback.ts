import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAppMode } from "@/lib/app-mode";
import { safeCallbackDestination } from "./policy";

export async function completeAuthCallback(request: NextRequest, kind: "confirmation" | "recovery" | "code") {
  const destination = kind === "recovery" ? "/auth/update-password" : safeCallbackDestination(request.nextUrl.searchParams.get("next"));
  const fail = (reason: string) => {
    const response = NextResponse.redirect(new URL(`/auth/link-error?reason=${reason}`, request.url));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  };
  if (getAppMode() !== "connected") return fail("disabled");
  const errorReason = (error: { status?: number; name?: string }) =>
    error.name === "AuthRetryableFetchError" || (error.status ?? 0) >= 500 ? "connection" : "invalid";
  try {
    const supabase = await createClient();
    const tokenHash = request.nextUrl.searchParams.get("token_hash");
    const type = request.nextUrl.searchParams.get("type");
    const code = request.nextUrl.searchParams.get("code");
    if (tokenHash && kind === "recovery" && type === "recovery") {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" });
      if (error) return fail(errorReason(error));
    } else if (tokenHash && kind === "confirmation" && (type === "email" || type === "signup")) {
      const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
      if (error) return fail(errorReason(error));
    } else if (code && (kind === "code" || kind === "recovery")) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return fail(errorReason(error));
    } else return fail("invalid");
    const response = NextResponse.redirect(new URL(destination, request.url));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch { return fail("connection"); }
}
