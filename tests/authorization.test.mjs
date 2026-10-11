import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { installStorageContract } from "./helpers/storage.mjs";

// Execute the actual migrations, RLS policies, triggers, and RPCs in PostgreSQL.
// Only Supabase's external auth.users/auth.uid contracts are represented locally.
const db = new PGlite();
const a = "10000000-0000-4000-8000-000000000001";
const b = "10000000-0000-4000-8000-000000000002";
const admin = "10000000-0000-4000-8000-000000000003";
const unconfirmed = "10000000-0000-4000-8000-000000000004";
let facilityA, facilityB;
const scalar = async (client, sql, values = []) => Object.values((await client.query(sql, values)).rows[0])[0];

async function asUser(user, callback, role = "authenticated") {
  await db.exec(`begin; set local role ${role};`);
  await db.query("select set_config('request.jwt.claim.sub', $1, true)", [user ?? ""]);
  try { return await callback(db); }
  finally { await db.exec("rollback"); }
}
const denied = (user, sql, values = [], role) => assert.rejects(asUser(user, client => client.query(sql, values), role), { code: "42501" });

before(async () => {
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;
    grant usage on schema public, auth to anon, authenticated;
    grant execute on function auth.uid() to anon, authenticated;
  `);
  await installStorageContract(db);
  for (const file of (await readdir(new URL("../supabase/migrations/", import.meta.url))).filter(f => f.endsWith(".sql")).sort()) {
    await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
  }
  for (const id of [a, b, admin, unconfirmed]) {
    await db.query("insert into auth.users(id,email_confirmed_at,raw_user_meta_data) values ($1,$2,$3)",
      [id, id === unconfirmed ? null : new Date().toISOString(), { display_name: "Test account", role: "platform_administrator", is_admin: true }]);
  }
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [a]);
  facilityA = await scalar(db, "select public.onboard_facility('Facility A','Madison','WI','hospital',$1)", ["20000000-0000-4000-8000-000000000001"]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [b]);
  facilityB = await scalar(db, "select public.onboard_facility('Facility B','Chicago','IL','surgery_center',$1)", ["20000000-0000-4000-8000-000000000002"]);
  // Explicit database-operator bootstrap. Registration never performs this.
  await db.query("insert into private.platform_administrators(user_id,bootstrap_reason) values ($1,'Local authorization test bootstrap')", [admin]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
  await db.query("select public.review_facility($1,'approved',null)", [facilityB]);
  await db.query("select set_config('request.jwt.claim.sub','',false)");
});
after(async () => { await db.close(); });

test("anonymous cannot read account tables or execute onboarding/approval", async () => {
  for (const table of ["profiles", "facilities", "facility_memberships"]) await denied(null, `select * from public.${table}`, [], "anon");
  await denied(null, "select public.onboard_facility('Anon Facility','Madison','WI','hospital',gen_random_uuid())", [], "anon");
  await denied(null, "select public.review_facility($1,'approved',null)", [facilityA], "anon");
  await denied(null, "select public.onboard_facility('Anon Facility','Madison','WI','hospital',gen_random_uuid())");
});

test("pending owner can view status but has no publishing, inquiry, or platform privileges", async () => {
  await asUser(a, async client => {
    assert.equal(await scalar(client, "select status from public.facilities where id=$1", [facilityA]), "pending");
    assert.equal(await scalar(client, "select role from public.facility_memberships where facility_id=$1", [facilityA]), "owner");
    assert.equal(await scalar(client, "select public.facility_can_publish($1)", [facilityA]), false);
    assert.equal(await scalar(client, "select public.facility_can_inquire($1)", [facilityA]), false);
    assert.equal(await scalar(client, "select public.is_platform_administrator()"), false);
    await client.query("select public.set_active_facility($1)", [facilityA]);
  });
});

test("two unrelated facilities are isolated by RLS and facility selection", async () => {
  for (const [user, own, other] of [[a, facilityA, facilityB], [b, facilityB, facilityA]]) {
    await asUser(user, async client => {
      assert.equal(await scalar(client, "select count(*)::int from public.facilities"), 1);
      assert.equal(await scalar(client, "select count(*)::int from public.facilities where id=$1", [other]), 0);
      assert.equal(await scalar(client, "select count(*)::int from public.facility_memberships where facility_id=$1", [other]), 0);
      assert.equal(await scalar(client, "select public.is_facility_member($1)", [own]), true);
      assert.equal(await scalar(client, "select public.facility_can_inquire($1)", [other]), false);
    });
    await denied(user, "select public.set_active_facility($1)", [other]);
  }
});

test("users cannot join, change roles, transfer ownership, approve, or grant platform administration", async () => {
  await denied(a, "insert into public.facility_memberships(facility_id,user_id,role) values ($1,$2,'owner')", [facilityB, a]);
  await denied(a, "update public.facility_memberships set role='administrator' where user_id=$1", [a]);
  await denied(a, "delete from public.facility_memberships where user_id=$1", [a]);
  await denied(a, "update public.facilities set owner_user_id=$1 where id=$2", [b, facilityA]);
  await denied(a, "update public.facilities set status='approved' where id=$1", [facilityA]);
  await denied(a, "insert into public.facilities(name,city,state,facility_type,owner_user_id,onboarding_request_id,status) values ('Fake facility','City','WI','hospital',$1,gen_random_uuid(),'approved')", [a]);
  await denied(a, "select public.review_facility($1,'approved',null)", [facilityA]);
  await denied(a, "insert into private.platform_administrators(user_id,bootstrap_reason) values ($1,'Self promotion attack')", [a]);
  await denied(a, "update public.profiles set active_facility_id=$1 where id=$2", [facilityB, a]);
});

test("profile metadata cannot promote users and only display_name is directly editable", async () => {
  await asUser(a, async client => {
    await client.query("update public.profiles set display_name='New display name' where id=$1", [a]);
    assert.equal(await scalar(client, "select display_name from public.profiles where id=$1", [a]), "New display name");
    assert.equal(await scalar(client, "select count(*)::int from public.profiles where id=$1", [b]), 0);
    const result = await client.query("update public.profiles set display_name='Attack' where id=$1 returning id", [b]);
    assert.equal(result.rows.length, 0);
    assert.equal(await scalar(client, "select public.is_platform_administrator()"), false);
  });
});

test("onboarding is transactional, pending, actor-owned, and idempotent", async () => {
  await asUser(a, async client => {
    const request = "20000000-0000-4000-8000-000000000099";
    const first = await scalar(client, "select public.onboard_facility('New facility','New City','wi','hospital',$1)", [request]);
    const second = await scalar(client, "select public.onboard_facility('New facility','New City','WI','hospital',$1)", [request]);
    assert.equal(first, second);
    const facility = (await client.query("select * from public.facilities where id=$1", [first])).rows[0];
    assert.equal(facility.owner_user_id, a); assert.equal(facility.status, "pending"); assert.equal(facility.state, "WI");
    assert.equal(await scalar(client, "select role from public.facility_memberships where facility_id=$1", [first]), "owner");
    assert.equal(await scalar(client, "select active_facility_id from public.profiles where id=$1", [a]), first);
  });
  await denied(b, "select public.onboard_facility('Attack Facility','Chicago','IL','hospital',$1)", ["20000000-0000-4000-8000-000000000001"]);
  await denied(unconfirmed, "select public.onboard_facility('Unconfirmed Facility','Chicago','IL','hospital',gen_random_uuid())");
  const count = await scalar(db, "select count(*)::int from public.facilities");
  await assert.rejects(asUser(a, client => client.query("select public.onboard_facility('X','City','WI','hospital',gen_random_uuid())")), { code: "22023" });
  assert.equal(await scalar(db, "select count(*)::int from public.facilities"), count);
});

test("a failure after facility insertion rolls back the facility, membership, and selection", async () => {
  const oldSelection = await scalar(db, "select active_facility_id from public.profiles where id=$1", [a]);
  const count = await scalar(db, "select count(*)::int from public.facilities");
  await db.exec(`
    create function private.test_reject_membership() returns trigger language plpgsql as $$
    begin raise exception 'Injected membership failure'; end; $$;
    create trigger test_reject_membership before insert on public.facility_memberships
      for each row execute function private.test_reject_membership();
  `);
  try {
    await assert.rejects(asUser(a, client => client.query("select public.onboard_facility('Rollback Facility','City','WI','hospital',gen_random_uuid())")), /Injected membership failure/);
    assert.equal(await scalar(db, "select count(*)::int from public.facilities"), count);
    assert.equal(await scalar(db, "select active_facility_id from public.profiles where id=$1", [a]), oldSelection);
  } finally {
    await db.exec("drop trigger test_reject_membership on public.facility_memberships; drop function private.test_reject_membership();");
  }
});

test("platform admin approval is audited and does not imply facility membership", async () => {
  await asUser(admin, async client => {
    assert.equal(await scalar(client, "select count(*)::int from public.facilities"), 2);
    assert.equal(await scalar(client, "select public.facility_can_publish($1)", [facilityB]), false);
    await client.query("select public.review_facility($1,'approved',null)", [facilityA]);
    assert.equal(await scalar(client, "select status from public.facilities where id=$1", [facilityA]), "approved");
    await client.exec("reset role");
    assert.equal(await scalar(client, "select count(*)::int from private.facility_approval_audit where facility_id=$1", [facilityA]), 1);
  });
  await denied(admin, "update public.facilities set status='approved' where id=$1", [facilityA]);
});

test("suspension immediately removes approved capabilities while preserving status visibility", async () => {
  await asUser(admin, async client => {
    await client.query("select public.review_facility($1,'suspended','Suspended for test review')", [facilityB]);
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [b]);
    assert.equal(await scalar(client, "select status from public.facilities where id=$1", [facilityB]), "suspended");
    assert.equal(await scalar(client, "select public.facility_can_publish($1)", [facilityB]), false);
    assert.equal(await scalar(client, "select public.facility_can_inquire($1)", [facilityB]), false);
    await client.query("select public.set_active_facility($1)", [facilityB]);
  });
});

test("membership revocation and platform-admin revocation take effect without JWT role changes", async () => {
  await asUser(admin, async client => {
    await client.exec("reset role");
    await client.query("update public.facility_memberships set status='revoked' where user_id=$1", [b]);
    await client.exec("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub',$1,true)", [b]);
    assert.equal(await scalar(client, "select public.facility_can_publish($1)", [facilityB]), false);
    assert.equal(await scalar(client, "select count(*)::int from public.facilities"), 0);
  });
  await assert.rejects(asUser(admin, async client => {
    await client.exec("reset role");
    await client.query("update private.platform_administrators set active=false where user_id=$1", [admin]);
    await client.exec("set local role authenticated");
    assert.equal(await scalar(client, "select public.is_platform_administrator()"), false);
    await client.query("select public.review_facility($1,'approved',null)", [facilityA]);
  }), { code: "42501" });
});

test("approved viewer may not inquire, publish, or elevate their role", async () => {
  await asUser(b, async client => {
    assert.equal(await scalar(client, "select public.facility_can_publish($1)", [facilityB]), true);
    await client.exec("reset role");
    await client.query("update public.facility_memberships set role='viewer' where user_id=$1", [b]);
    await client.exec("set local role authenticated");
    assert.equal(await scalar(client, "select public.facility_can_publish($1)", [facilityB]), false);
    assert.equal(await scalar(client, "select public.facility_can_inquire($1)", [facilityB]), false);
  });
});

test("review validation cannot produce arbitrary statuses or unaudited rejection", async () => {
  for (const [status, reason] of [["owner", null], ["rejected", "short"], ["suspended", null]]) {
    await assert.rejects(asUser(admin, client => client.query("select public.review_facility($1,$2,$3)", [facilityA, status, reason])), { code: "22023" });
  }
});
