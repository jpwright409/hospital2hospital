import test from "node:test";
import assert from "node:assert/strict";
import { facilityCapabilities, safeCallbackDestination, validUuid } from "../src/lib/auth/policy.ts";
import { assertDemoMutationAllowed, getAppMode, getSupabaseConfig, getSiteUrl } from "../src/lib/app-mode.ts";

const facility = { id: "facility-a", owner_user_id: "a", status: "approved" };
const membership = { facility_id: "facility-a", user_id: "a", role: "owner", status: "active" };

test("UI capabilities deny anonymous, unrelated, pending, suspended, rejected, and revoked contexts", () => {
  for (const [user, f, m] of [
    [null, facility, membership], ["b", facility, membership],
    ["a", { ...facility, status: "pending" }, membership],
    ["a", { ...facility, status: "suspended" }, membership],
    ["a", { ...facility, status: "rejected" }, membership],
    ["a", facility, { ...membership, status: "revoked" }],
    ["a", facility, { ...membership, facility_id: "facility-b" }],
  ]) {
    const result = facilityCapabilities(user, f, m);
    assert.equal(result.canPublish, false); assert.equal(result.canInquire, false);
  }
  const allowed = facilityCapabilities("a", facility, membership);
  assert.equal(allowed.canPublish, true); assert.equal(allowed.isOwner, true);
  assert.equal("isPlatformAdministrator" in allowed, false);
});

test("callback destinations cannot redirect to external or arbitrary internal paths", () => {
  for (const path of [null, "https://attacker.example", "//attacker.example", "/admin/facilities", "/\\attacker.example", "/account?next=https://attacker.example"]) {
    assert.equal(safeCallbackDestination(path), "/marketplace");
  }
  assert.equal(safeCallbackDestination("/auth/update-password"), "/auth/update-password");
  assert.equal(validUuid("not-a-uuid"), false);
});

test("connected mode fails closed and blocks demo mutations without requiring privileged credentials", () => {
  const old = { ...process.env };
  try {
    process.env.NEXT_PUBLIC_APP_MODE = "connected";
    delete process.env.NEXT_PUBLIC_SUPABASE_URL; delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    assert.equal(getAppMode(), "connected");
    assert.throws(getSupabaseConfig, /Connected mode requires/);
    assert.throws(assertDemoMutationAllowed, /disabled in connected mode/);
    assert.equal(getAppMode(), "connected");
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
    assert.deepEqual(getSupabaseConfig(), { url: "https://example.supabase.co", key: "test-publishable-key" });
    process.env.NEXT_PUBLIC_SITE_URL = "http://localhost:3000";
    assert.equal(getSiteUrl(), "http://localhost:3000");
    process.env.NEXT_PUBLIC_SITE_URL = "https://example.com/arbitrary-path";
    assert.throws(getSiteUrl, /origin/);
    process.env.NEXT_PUBLIC_APP_MODE = "demo"; assert.doesNotThrow(assertDemoMutationAllowed);
    process.env.NEXT_PUBLIC_APP_MODE = "invalid"; assert.throws(getAppMode, /demo or connected/);
  } finally {
    for (const name of ["NEXT_PUBLIC_APP_MODE", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SITE_URL"]) {
      if (old[name] === undefined) delete process.env[name]; else process.env[name] = old[name];
    }
  }
});
