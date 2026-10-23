## October 22: automatic watchlist/referral delivery and account removal

The user confirms Supabase SMTP, redirects, password recovery, registration confirmation and manual account invitations work against the hosted project. Those Auth emails are separate from the application email queue below.

### Apply migrations before publishing this release

Apply these in SQL Editor, after 017, in order:

1. **20261022001800_account_removal.sql** ? permanent account-removal controls, directory filtering, service-only removal claim validation and retained business history.
2. **20261022001900_email_delivery.sql** ? live disabled/removed/banned-account checks when claiming application email jobs.

The implementation does not apply hosted migrations, deploy, configure GitHub secrets or send real emails. Existing SUPABASE_SECRET_KEY remains the server-only credential for administrator account actions. No new public key or SMTP changes are required for removal.

### Turn on automatic delivery (GitHub Actions)

Delivery runs from GitHub, independently of Vercel. This avoids requiring frequent Vercel Cron support on your hosting plan. The workflow runs from main about every five minutes and sends at most 20 eligible queued emails per run. It only runs after the explicit opt-in below. Do not enable it before migrations and the verified sender are ready.

In your GitHub repository, open **Settings ? Secrets and variables ? Actions**.

Under **Secrets**, add these as repository secrets (never paste their values into source code, chat, or repository Variables):

| Secret name | Value |
| --- | --- |
| RESEND_API_KEY | Your existing Resend sending API key, authorized for the verified sending domain |
| SUPABASE_EMAIL_SECRET_KEY | A dedicated Supabase secret key for this worker, mapping to service_role; create it in the existing Supabase project's API key settings |

Under **Variables**, add these repository variables:

| Variable name | Value |
| --- | --- |
| H2H_EMAIL_FROM | Hospital2Hospital <info@hospital2hospital.com> |
| NEXT_PUBLIC_SITE_URL | Your current canonical live HTTPS website origin (no localhost) |
| NEXT_PUBLIC_SUPABASE_URL | The same existing project URL used by the website |
| H2H_EMAIL_ENABLED | true ? set this last, when ready to send |

A secret in Vercel or ignored .env.local is not automatically available in GitHub. The worker does not need the ordinary publishable key, the photo key, or the support key.

In **Vercel ? Project ? Settings ? Environment Variables**, set **H2H_EMAIL_ENABLED=true** for Production and redeploy. This enables the watchlist email checkbox and referral form. Vercel does not need the dedicated worker credential for these features; it uses ordinary guarded operations to queue work. Worker secrets remain in GitHub. Local testing of the UI uses the same flag in ignored .env.local; the agent has not edited that file.

After this release is on main, open **GitHub ? Actions ? Deliver watchlist and referral emails ? Run workflow ? main**. A skipped run means the enable variable is absent/false or the selected branch is not main. A green run logs only claimed/accepted/retry counts. Accepted means Resend accepted the request, not guaranteed inbox delivery; inspect Resend's Delivered/Bounced status and the recipient's inbox/spam folder. Errors produce a failed Actions run without exposing recipients/keys/tokens.

The workflow has no pull-request trigger, uses a read-only repository token, serializes runs, and exposes worker credentials only to the sending step. Protect main and limit repository write/Actions secret administration permissions: this worker credential is privileged. Dependency installation disables lifecycle scripts.

GitHub schedules are best effort and can be delayed or dropped under load. Public-repository scheduled workflows can be disabled after 60 days without repository activity. Check Actions periodically and reenable if needed. For tighter delivery guarantees later, move the same worker to a managed scheduler. Reference: https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule . No Vercel cron job or public sending endpoint is added.

To pause, set the GitHub H2H_EMAIL_ENABLED variable to false; also set the Vercel flag false and redeploy to hide email options. Disabling the workflow stops future runs; an already in-flight email cannot be recalled. Unsold/unpaused queued jobs expire after 23 hours or five attempts, and are not resurrected automatically. Before enabling a previously used queue, inspect pending jobs in trusted SQL Editor; decide whether they should be cancelled rather than sent. Never requeue sent/ambiguous jobs with a fresh ID. A run claims at most 20 candidate rows, including cancellations/expiry, so a large invalid backlog can take multiple runs to clear.

Read-only operator diagnostics (SQL Editor only):

    select state, count(*), min(created_at) as oldest
    from private.email_jobs group by state order by state;

Do not expose the private queue to ordinary users. Missing/incorrect settings fail closed. Per-user unsubscribe is the watchlist email checkbox, pause or delete action; claims recheck those controls. There is no promotional mailing list, conversation-email alert, or support-email notification in this release.

### Account removal semantics

In **Facilitator Dashboard ? Users ? Manage account**, choose **Permanently remove account**. Enter the target email exactly, provide the required audit reason, check confirmation, and use the red removal button. All checks execute on the server and database, including direct API attempts. Self-removal and active platform administrator removal are prohibited. An account owning any facility cannot be removed until a trusted operator transfers that ownership and matching memberships; this release does not add an ownership-transfer UI. Use Disable for reversible restrictions.

The action first commits a permanent pending-removal access block, then rechecks its exact privileged journal claim and calls Supabase Auth deleteUser(id, true) server-side. This is irreversible Auth soft deletion: it removes authentication identity while retaining the UUID row required by facility inventory, messages, support and audit foreign keys. It is not hard deletion or a promise to erase every historical business record. On confirmed success, revoke memberships, label the profile Removed user, remove avatar/personal saves/watchlists and cancel pending application emails. Hide removed accounts from the active user directory; retain audit records and shared facility/listing/conversation/support history and objects. No unrelated Storage objects are deleted. Official behavior: https://supabase.com/docs/reference/javascript/auth-admin-deleteuser .

Auth and database changes cannot share a transaction. Any failed/uncertain removal remains blocked, cannot be enabled/retried from the UI, and requires reconciliation in the trusted SQL Editor plus Supabase Auth. Check the audit request ID and actual Auth deleted_at. If Auth soft deletion completed, finish that exact existing claim with the service-only finalizer after verifying the outcome; never issue a hard-delete fallback or create another removal identity. If Auth did not complete, investigate the reason (including Storage ownership constraints) and use a reviewed operator recovery/retry of the original request. Do not clear controls blindly. Operator role/ownership changes must not race with requested/uncertain account actions; check the audit before making such changes. Existing signed image URLs may remain usable until their short expiry.

### Manual live checklist after setup

1. Create a watchlist with email enabled for an exact test catalog number. Publish a new matching active listing from an approved facility; verify one match and one queued job. Run the workflow, confirm a single delivered email, correct live listing link, and expected counts. Editing/repeated reactivation must not send duplicates.
2. Pause/uncheck/delete a watch before a new queued job is claimed; verify cancellation. Repeat with sold/deactivated stock, suspended seller and disabled recipient. A claimed/in-flight message may already be accepted and cannot be recalled.
3. From an eligible approved facility, refer a controlled test address. Verify the correct inviter/facility, registration link and no automatic membership/administrator grant. Retry the same submission and check only one email. Verify limits and revoked/suspended sender cancellation.
4. Simulate a provider failure only in a controlled test environment; verify a failed Actions run, bounded retry and stable Resend idempotency. Check lease recovery after interruption and inspect provider receipt before manual reconciliation. Never send test mail to uncontrolled recipients.
5. Invite a disposable nonadministrator account, log in in a second browser, give it an editor/viewer membership and personal saves/watchlist, then remove it through Users. Verify the directory entry disappears, login/refresh/old-JWT table/RPC/Storage access is denied, membership is revoked, and shared inventory/messages/support remain. Confirm the old account cannot be enabled. The original email may register a new independent account; it receives no inherited memberships or saves.
6. Verify ordinary/anonymous users cannot remove accounts; direct requests cannot remove self, other administrators or facility owners, bypass typed confirmation, forge target email or claim, or repeat an unresolved operation. Test Auth failure with mocks first; live failure reconciliation requires a trusted operator.

Local automated verification is recorded in CODEX.md. It uses actual SQL/RLS in PGlite and mocked Auth/provider operations, not live email delivery, GitHub scheduling or hosted Auth soft-deletion/Storage constraints.


# Supabase account and inventory setup

Phase 1 provides confirmed-email accounts, facility onboarding, selection and platform approval. Phase 2 adds reference products, inventory, search and saves. Phase 3 adds private listing photos and facility conversations. No remote migrations, reference imports, or deployment have been performed against your hosted project.

## Versions and prerequisites

The installed application was inspected: Next.js **16.3.8**, React 19, and App Router. It uses `src/proxy.ts` (the Next.js 16 convention), not a guessed middleware filename. Supabase clients use `@supabase/ssr` and `@supabase/supabase-js`. Follow the lockfile with `npm ci`.

Use Node 22.18+ or the tested Node 24 environment for the TypeScript-stripping test runner. `npm run dev`, `npm run lint`, `npm test`, `npm run build`, and `npm start` are the development commands. In this Windows PowerShell environment use `npm.cmd` if script execution policy blocks `npm.ps1`.

Official references:
- https://supabase.com/docs/guides/auth/server-side/creating-a-client?framework=nextjs
- https://supabase.com/docs/guides/auth/passwords
- https://supabase.com/docs/guides/database/postgres/row-level-security

## Environment

Copy `.env.example` to `.env.local`; `.env.local` remains ignored by Git. Do not commit real environment files.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_APP_MODE` | `demo` or `connected`. With no configuration, the prototype defaults to demo. Accounts require explicit connected mode. Invalid values fail rather than select a mode automatically. |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL, or the URL of your local Supabase instance. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | The project's publishable key from its Connect dialog. It is designed for ordinary browser/server clients; RLS and authenticated sessions enforce permissions. |
| `NEXT_PUBLIC_SITE_URL` | Exact application origin, e.g. `http://localhost:3000`, without a path/query/fragment. Used for email redirects. |

Set mode to `connected` only after replacing placeholders and applying migrations. Restart development after changes. For production rebuild and restart: `NEXT_PUBLIC_*` values are embedded during the build. A failed connection never switches the application back to demo or grants demo account permissions. Public demo browsing is a separate, clearly labeled feature.

**Ordinary accounts, inventory, saves and conversations require no privileged key. Phase 3 photo validation/failure cleanup alone uses a server-only secret key; see below.** Never put such a key in a `NEXT_PUBLIC_*` variable. Do not add `private` to the Supabase exposed schemas.

## Apply the migrations yourself

Versioned files, in order:
1. `supabase/migrations/20261004000100_account_facilities.sql`
2. `supabase/migrations/20261004000200_platform_approval.sql`
3. `supabase/migrations/20261004000300_inventory.sql`
4. `supabase/migrations/20261004000400_marketplace_queries.sql`
5. `supabase/migrations/20261004000500_listing_photos.sql`
6. `supabase/migrations/20261004000600_facility_conversations.sql`

If Phases 1 and 2 are already installed, apply only 005 and 006, in that order. If only Phase 1 is installed, apply 003 through 006. Each new file includes a transaction. Do not rerun already-applied migrations.

For a hosted test project, use its SQL Editor to run each complete file in order, with a trusted database-operator account. Alternatively, use the Supabase CLI's migration workflow after deliberately selecting/linking the intended project. CLI migrations track their history; manually executing SQL files in the SQL Editor does not record CLI migration history, so reconcile that history before later mixing approaches. These instructions do not authorize automatic remote migration execution by the application.

For local Supabase, install Docker and the Supabase CLI, initialize the CLI configuration with `supabase init` if it does not exist, start the local stack with `supabase start`, and apply pending migrations locally with `supabase migration up --local`. Use the local project's URL and publishable key. The in-memory authorization tests below do not require Docker or CLI installation.

The migration assumes the Supabase `auth.users`, `auth.uid()`, `anon`, and `authenticated` contracts. It provisions profiles on signup and backfills existing users. Tables and functions are transactionally created. If your project already has tables with these names, review and reconcile before applying; do not blindly rerun partially adapted SQL. A missing schema/function is surfaced as a setup error, not demo fallback.

## Email confirmation and redirects

In Supabase Auth:
1. Enable email/password and **Confirm email**. Configure a suitable password policy; the application requires 12–128 characters for new passwords.
2. Set Site URL to the same origin as `NEXT_PUBLIC_SITE_URL`.
3. Allow these local redirect URLs (replace origin if testing on another port):
   - `http://localhost:3000/auth/callback`
   - `http://localhost:3000/auth/confirm`
   - `http://localhost:3000/auth/recovery`
   - `http://localhost:3000/auth/update-password`
4. Use precise allowed origins in production. `localhost` and `127.0.0.1` are different origins/cookie stores; use one consistently.

Recommended confirmation email link template:

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirm your email</a>
```

Recommended recovery email link template:

```html
<a href="{{ .SiteURL }}/auth/recovery?token_hash={{ .TokenHash }}&type=recovery">Reset your password</a>
```

These token-hash callbacks verify the one-time token server-side and set session cookies. Confirmation permits `email`/`signup` tokens; recovery permits `recovery` tokens. Callbacks reject missing/invalid/expired tokens. Redirect destinations are allowlisted, not arbitrary user-supplied URLs.

Default `{{ .ConfirmationURL }}` templates are also supported with PKCE `code` callbacks: signup redirects to `/auth/callback`, recovery to `/auth/recovery`. A PKCE code must be opened in the same browser/origin that initiated the flow because its verifier is stored in cookies. The recommended token-hash templates avoid that browser-verifier limitation.

Hosted Supabase's default email sender has restrictions and low testing limits. Configure custom SMTP with a verified sender for testing arbitrary email addresses and production delivery. Check Auth email logs/rate limits, inbox/spam folders, and redirect settings when emails do not arrive. For local Supabase, read confirmation/recovery emails in the local Mailpit inbox. No SMTP credentials belong in this application's public environment variables.

## Bootstrap the first platform administrator manually

Registration **never** promotes the first or any later user. Owners are facility members, not platform administrators. Platform authority is held in an RLS-protected, non-exposed table: `private.platform_administrators`. There is no application/API function for granting it.

1. Have the intended administrator register and confirm their email normally.
2. A trusted database operator verifies the person's identity independently, then locates their exact UUID in the SQL Editor:

```sql
select id, email, email_confirmed_at
from auth.users
where lower(email) = lower('verified-admin@example.org');
```

3. Confirm the exact email and UUID; do not choose the first account or rely on signup metadata. In a privileged SQL Editor session, run this with both placeholders replaced:

```sql
begin;
do $bootstrap$
declare
  candidate uuid := 'REPLACE-WITH-VERIFIED-USER-UUID'::uuid;
begin
  if not exists (
    select 1 from auth.users
    where id = candidate
      and lower(email) = lower('verified-admin@example.org')
      and email_confirmed_at is not null
  ) then
    raise exception 'Verified, email-confirmed administrator account not found';
  end if;
  insert into private.platform_administrators(user_id, bootstrap_reason)
  values (candidate, 'Identity verified by trusted operator; first administrator bootstrap');
end;
$bootstrap$;
commit;
```

4. The administrator logs in and opens `/admin/facilities`. Keep a separate record of who approved the bootstrap and why. Additional administrators require the same deliberate operator process.
5. Revoke administration with a trusted operator's `update private.platform_administrators set active = false where user_id = 'EXACT-UUID';`. The next permission check reads that change immediately; user metadata and old JWT role claims cannot preserve access. Avoid unintentionally revoking the only administrator without an operator recovery process.

Do not change grants/RLS to make bootstrap easier. No privileged application key is needed for this SQL-operator task.

## Exercise the account and approval flows

1. In connected mode, open `/auth/register`. Submit name/work email/password. Confirm the email, then log in. Try unconfirmed login and resend via `/auth/resend-confirmation`.
2. Visit `/account/onboarding`. Submit facility name, city, state, and type. Creation, owner membership, and active-facility selection happen in one database transaction. A retried submission with the same request ID is idempotent.
3. `/account` and `/dashboard` show pending status. Owners cannot approve facilities or see `/admin/facilities`. They can view their status and select their own active memberships.
4. Onboard another facility if needed and test active-facility selection. The database rejects arbitrary facility IDs, direct profile selection changes, direct membership creation, and role/ownership changes.
5. In a separate administrator session, review `/admin/facilities`. Filter Pending/Approved/Rejected/Suspended. Approve a facility, then refresh its owner's workspace. Inventory management becomes available to active owners and inventory editors. Phase 3 adds participant-only conversations.
6. Suspend the facility with a reason of at least 10 characters. Its owner can still view the status, but live permission functions return false. Re-approval restores eligibility. Rejection/suspension reasons appear in the workspace.
7. Log out. Protected account, administration, dashboard, create/edit, and password-update routes redirect to login in connected mode. Server actions also independently revalidate identity and permission. A fabricated POST/RPC or UUID does not bypass SQL authorization.
8. Request password recovery. Open its email link, set matching new passwords, log out, then log in with the new password. Try expired/reused links and mismatched inputs. Password update requires a verified current Auth session.
9. Disconnect/misconfigure the service and try account actions. Expect actionable errors or a connection-unavailable screen, not demo permissions. Public marketplace browsing must also show a connection error, never fictional stock.
10. Verify explicit demo mode still supports original local workflows. Connected mode never reads demo stock or bookmarks. It uses actual inventory and user-owned saved records. Demo mutations and inquiries are blocked in the repository. Switching modes preserves demo storage.

## Security and scope

- `profiles`: own-row reads and display-name-only direct updates. No direct active-facility/identity changes.
- `facilities`: reads for active members or live platform administrators; no ordinary direct writes.
- `facility_memberships`: own-row reads; no ordinary direct inserts/updates/deletes. No join-existing-facility API or invitation flow is implemented in Phase 1.
- `onboard_facility`: confirmed actor only; always creates pending stock-independent facility plus its owner membership. Cannot choose another owner or status.
- `set_active_facility`: checks live active membership. Pending/suspended selection permits status viewing, not operational eligibility.
- `review_facility`: live platform administration check; constrained decisions and private audit. Approval does not change ownership or memberships.
- `facility_can_publish` / `facility_can_inquire`: live approval plus active membership; publishing additionally checks the member's role. Inventory publishing additionally requires owner or inventory_editor; owners must match owner_user_id. Facility administrator membership alone does not grant inventory management. Conversation access checks confirmed identity, permitted live roles and approval; viewers cannot inquire.
- Definer functions have fixed empty search paths, qualified objects, no user-supplied acting identity, and explicit EXECUTE grants. Private tables have RLS and no ordinary API grants. User-editable signup metadata never controls privileges.
- Server pages/actions use Auth `getUser()` for fresh identity; Proxy verifies/refreshes cookie sessions via `getClaims()`. Private responses are not shared-cache responses. Client capability badges are informational only.
- Ownership transfer, member invitations/role management, identity-document collection, deployment are not implemented. Facility review currently relies on an administrator's manual verification outside the app.

## Automated validation and limits

```sh
npm test
npm run lint
npm run build
```

The authorization suite applies all actual SQL migrations to an in-memory PGlite PostgreSQL engine. It models only Supabase's external Auth contracts (`auth.users`, `auth.uid()`, and API roles); it executes real PostgreSQL grants, RLS, triggers, and security-definer functions. Coverage includes anonymous users, unconfirmed users, pending owners, unrelated facilities, suspended facilities, direct privileged writes, ownership/role escalation, forged signup metadata, idempotence, atomic rollback, selection, admin approval/audit, and live membership/admin revocation. Pure application-policy tests cover capability calculation, allowlisted callbacks, mode validation, and blocked connected demo mutations.

These tests do **not** validate a live Supabase project, SMTP delivery, actual email tokens, session refresh against GoTrue, or production infrastructure. Complete the account/email/approval checklist on your own configured test project before pilot use. No remote migrations were applied by the implementation.

## Phase 2 catalog import

No new environment variables or privileged application keys are needed. Keep your tested Phase 1 environment and email configuration. Before running the connected app, apply migrations 003 and 004 yourself and refresh PostgREST’s schema cache if needed (`notify pgrst, 'reload schema';`). The new tables enable RLS immediately; ordinary clients cannot directly change products, manufacturers, or inventory.

Run the read-only workbook dry run from this project directory:

```sh
npm run catalog:dry-run
# or specify a compatible workbook:
node scripts/catalog-import.mjs --workbook path/to/reference.xlsx
```

The supplied workbook contains **122 reference rows across two catalog sheets, 61 unique products, 24 manufacturers, and 61 duplicate rows**. The recommendations sheet is excluded. This is not stock. The dry run prints counts/conflicts and writes nothing. It does not connect to Supabase.

Generate a new SQL file for review:

```sh
node scripts/catalog-import.mjs --output-sql reference-catalog.sql
```

The output path must not already exist, to prevent accidental overwrites. Review the file, then run the complete SQL in a trusted database operator session (SQL Editor or `psql`), after applying migrations. The importer never runs this SQL or handles credentials itself. The generated SQL contains one transaction and reports inserted manufacturers/products and preserved existing products. It creates no facilities, listings, prices, stock, or memberships. Rerunning the SQL is safe: `ON CONFLICT DO NOTHING` preserves existing shared metadata.

Identity normalization trims surrounding whitespace, collapses internal whitespace, and lowercases manufacturer and catalog number independently; punctuation remains significant. Different manufacturers sharing a catalog number remain different products. Repeated rows use the first catalog sheet’s metadata; dry-run conflicts are reported rather than overwritten. GTIN and reference source are retained. Display names use the manufacturer description’s first 180 characters; the full reference description remains separate. Manufacturer aliases such as a brand versus its parent company are not automatically merged. Curate any alias/correction decisions through a trusted catalog-maintenance process; seller operations cannot edit shared references.

## Phase 2 data access and permissions

- `manufacturers`: public reference identity, unique normalized name. `products`: public reference metadata, unique `(manufacturer_id, normalized_catalog_number)`. No facility stock is held in either table.
- `listings`: immutable `facility_id` and `product_id`, quantity, quantity unit, items per package, USD unit price, condition, expiration, sterile/single-use flags, packaging, notes, active/inactive/sold status, revision and timestamps. `price_usd` is **per quantity unit**, not per item inside a package; zero means offered free. “Each” has exactly one item, while box/case/pack carries explicit package size. These are asking prices, without payments or transaction totals.
- Public clients can read active inventory from currently approved facilities. The `security_invoker` marketplace view respects listing RLS. `marketplace_facility` deliberately returns only id/name/city/state/type; private owner, review, profile, membership and email data remain inaccessible to public visitors.
- Live active owners matching facility ownership and inventory editors can view their facility’s inactive/sold inventory. They can write only while the facility is approved and their email is confirmed. Suspended/rejected/pending owners retain inventory visibility but cannot modify it. Revoked members retain only the same public browsing access as anyone else. A platform administrator has no inventory-management permission merely by being an administrator.
- `create_inventory_listing` checks and locks facility/membership rows, resolves an existing canonical identity or proposes a new product, and inserts its listing in one transaction. Existing products are reused without overwriting metadata. Any invalid inventory rolls the entire operation back. `update_inventory_listing` authorizes the actual owning facility, prohibits product/facility transfers and rejects stale revisions. No direct client INSERT/UPDATE/DELETE permissions exist on inventory or shared references.
- `saved_listings`: private `(user_id, listing_id)` records, tied to the verified account rather than its active facility. RLS enforces actor-only reads/inserts/deletes, even on direct API requests. Saves can only be added for publicly active listings. Unavailable saved listings show a removable placeholder containing no private inventory information. Existing saves can be removed after the listing becomes unavailable.
- `search_inventory`: database filtering by catalog/manufacturer/name tokens, category, manufacturer identity and location; deterministic newest/price sorting, exact total and page sizes up to 48. App pages use 12 results. Search text is literal and each whitespace-delimited token must match; it is not SQL or wildcard syntax. The GET form and pagination retain state in the URL, including browser Back/Forward. Price sorting compares price per quantity unit, so compare package sizes before interpreting different offers.
- Server Components await the data adapter in `src/lib/inventory/server.ts`. Global loading/error boundaries cover reads; action forms show pending, validation, stale-edit and permission errors. Mutations independently authenticate on the server and use the same database safeguards as direct API calls. Public and private connected routes refresh cookies through Proxy and avoid shared caching. No connection error enables fictional stock or demo writes.

There is no membership invitation or role-management UI in this phase. A trusted operator may provision an explicitly verified inventory editor for an exact facility/user pair or revoke an existing membership using privileged SQL. Verify the account UUID/email, facility ownership, and authorization before doing so; never expose that operator capability or a privileged key to the application. Facility owners cannot join unrelated facilities or grant themselves new roles.

## Inventory regression checklist (original Phase 2 flows)

These steps are **not completed by the automated suite**. Use isolated development accounts and stock you intentionally enter; do not infer stock from reference products.

1. Apply 003 and 004 and optionally import the reference catalog. Start the app in connected mode. With no listings, the homepage and marketplace show empty inventory even though the reference catalog is populated. Check existing login/logout, email confirmation, recovery and onboarding still work.
2. Use two unrelated confirmed accounts/facilities A and B, approved by the separate platform administrator. Select A in `/account`; create actual test inventory through `/dashboard` → Create listing, selecting a reference product. Specify quantity unit, package size and USD price. Create another listing for the same product; verify the two listings share one product record.
3. Propose a new reference through the form. Repeat the normalized manufacturer/catalog identity with different description/name; verify the existing shared product remains unchanged. Invalid stock must not leave a newly proposed product/manufacturer behind.
4. Edit A’s listing. Change its quantity/package/price/notes. Deactivate, reactivate and mark sold. Inactive/sold inventory stays in A’s dashboard and disappears from anonymous search. Reactivation restores its current quantity; verify stock before reactivating sold records. Try saving an old edit after another edit; expect a reload-required error.
5. In an anonymous window, browse details and search by catalog number, manufacturer, and name. Combine category/manufacturer/location, change sorting, and paginate (enter at least 13 listings to exercise a second page). Reload/share the URL and use Back/Forward; state must remain consistent. Public responses expose no personal email, owner UUID, membership or review details. Phase 3 now enables Contact Seller only for eligible approved participant facilities.
6. Log in as B and try A’s inactive/sold detail/edit URLs. They must be unavailable. Using B’s normal authenticated Supabase client, call `update_inventory_listing` against A, directly insert/update/delete inventory or products, and include a `facility_id`/`product_id` transfer field in the update payload. Expect database permission failures and no changed data. Public active A inventory remains readable to B, as intended.
7. Save an active A listing as B. Reload, sign out/in, and test another device/browser; saves remain attached to B. A cannot read/change B’s rows by submitting B’s `user_id` directly. After A deactivates/sells the listing, B sees an unavailable placeholder and can remove it without reading its private stock.
8. Keep a third facility pending and test creation/edit RPC requests with its owner’s authenticated client. Reject or suspend an approved test facility through the administrator screen. Its stock immediately disappears publicly and owner/editor mutations fail, including direct RPC calls. Re-approve to restore eligible inventory access. A platform administrator without membership must not manage its inventory.
9. With a trusted operator, add a verified `inventory_editor` membership to one test facility; confirm it can manage only that facility’s stock. Revoke that membership (`status='revoked'`) while the editor’s session remains logged in. The next mutation must fail without logging out; inactive/sold inventory becomes inaccessible. Test viewer and facility administrator roles cannot publish or elevate themselves. Ordinary clients cannot add/change membership rows.
10. Disconnect or misconfigure the service and request inventory, saves and seller actions. Expect loading followed by retry/setup feedback, never seed stock, local bookmarks or demo inquiry success. Restore configuration and retry. Switch explicitly to demo mode only when you want fictional local workflows; original demo storage remains intact.

## Phase 2 implementation verification

Automated Phase 2 checks now execute all versioned migrations in local PGlite, with mocked external Supabase Auth contracts and real PostgreSQL RLS/grants/functions. Coverage includes anonymous stock reads, safe facility projections, two-facility isolation, owner/editor/viewer permissions, pending/rejected/suspended facilities, live revocation, direct writes and privilege/ownership-transfer attempts, shared-product protection, product/listing rollback, stale revisions, USD/package validation, private saves/tombstones, literal search/filter/sort/pagination, and repeatable reference import with no stock creation. Existing Phase 1 authorization/callback/mode checks remain included.

The latest local run: **27 tests passed**, lint passed, and production builds passed in demo mode and connected mode with process-only local placeholder URL/key overrides. The hosted development configuration in `.env.local` was preserved; no migrations, imports or tests were run against that project. Before `npm start`, rebuild normally using your configured `.env.local`, since the verification build embeds placeholder public settings. Registration/confirmation/recovery were previously tested by you; Phase 2’s live Auth/PostgREST/browser workflows still need the manual checklist above. Phase 3 extends this record below. Invitations and deployment remain outside scope.

## Phase 3 migrations, bucket and environment

Your Phases 1 and 2 are already configured and tested. Apply **only** these new files yourself, in order, using a trusted SQL Editor session or your existing reconciled migration workflow:

1. `supabase/migrations/20261004000500_listing_photos.sql`
2. `supabase/migrations/20261004000600_facility_conversations.sql`

Migration 005 creates photo metadata with RLS, its controlled operations and Storage policies, and configures the **private** `listing-photos` bucket: maximum **5 MiB (5 × 1024 × 1024 bytes)** per file and JPEG/PNG/WebP MIME allowlist. Check these settings in Storage after applying it; the project's global Storage size limit must also permit a 5 MiB upload. Do not make this bucket public. Migration 006 adds RLS-protected conversations/messages/personal read cursors and protected inquiry/reply operations. Refresh PostgREST’s schema cache after applying migrations (`notify pgrst, 'reload schema';`). Do not rerun already-applied migrations or the reference import merely to add Phase 3.

Add one new variable to your existing ignored `.env.local`, **without replacing your tested configuration**:

```dotenv
# Server-only, never NEXT_PUBLIC_ and never committed:
SUPABASE_SECRET_KEY=<server-only-photo-key>
```

Use a dedicated backend secret key from your project's API Keys settings. Supabase maps a secret key to the privileged `service_role` database role. It is needed only because ordinary clients must not certify unvalidated bytes as public photos, and safe compensation must be able to remove a specific failed upload even if its uploader is subsequently revoked/suspended. The isolated `src/lib/supabase/photo-admin.ts` client never forwards user cookies. Accounts, onboarding, inventory, saves, conversations and photo signing continue using the publishable key and ordinary caller identity. Missing this secret produces an actionable photo-mutation error; those other workflows do not require it. Restart development after adding it. See [Supabase’s current API key guidance](https://supabase.com/docs/guides/getting-started/api-keys).

The Next.js Server Action request limit is **4 MB (4,000,000 bytes)** for **one** image up to **3 MB (3,000,000 bytes)** plus multipart overhead and form fields, below the Vercel 4.5 MB ceiling. Shared limits live in `src/lib/upload-limits.mjs`. Existing Storage buckets/database metadata retain their historical 5 MiB ceiling; the application imposes the stricter 3 MB limit, so no migration or bucket reconfiguration is required. There is no six-file batch upload: upload one at a time. The file input checks size before submission; the server independently validates actual bytes. Sharp accepts only JPEG/PNG/WebP signatures and decoders, rejects SVG, damaged and animated images, limits inputs to 20 megapixels/10,000 pixels per side, fully decodes/re-encodes to WebP (up to 2,400 pixels per side) and strips original metadata such as EXIF. Unique paths are generated in the database, not from uploaded filenames.

`reserve_listing_photo` atomically reserves one of six pending/ready slots while locking its actual listing and checking live owner/editor approval. Storage INSERT requires that exact reservation and live owning-facility permission; a path prefix is never sufficient. Storage UPDATE/overwrite is forbidden. Ordinary direct uploads can remain pending but cannot finalize or become publicly readable. Only the trusted server finalizes its sanitized, successfully uploaded immutable object, checking the stored uploader's current approval/membership and object metadata again. Public photo metadata omits uploader identity. Photo remove/reorder/cover RPCs require the same live inventory-management permission; facility administrators and viewers are not photo managers in this phase.

## Photo display and signed URL expiry

Cards and detail pages show real cover/gallery photos or a neutral “No photo provided” placeholder. Create a listing first, then open its edit page to upload, reorder, select its cover and remove photos. Detail pages offer **Refresh photos**; a broken/expired image displays a clear unavailable state.

Signing uses the caller's ordinary client, never an admin signing shortcut. Public visitors can sign only ready photos for active listings from approved facilities. Approved active owners/editors may sign photos for their facility’s inactive/sold listings. Revoked memberships no longer grant private photo access; suspended facilities have no publicly readable photos or privileged photo-management access. The bucket's Storage policies check exact metadata and the listing’s real facility; the metadata table itself is RLS-protected.

Signed links expire after **60 seconds**. A signed link is a bearer capability: a previously issued link may continue to work until expiry after a listing is deactivated, membership is revoked or a facility is suspended. Subsequent signing requests are denied immediately. Bytes already downloaded/cached by a visitor cannot be recalled; URL expiry does not remove an image already displayed in the browser. Reload/refresh to obtain new URLs when eligible. Images are rendered without Next.js’s shared image optimizer, uploads use a short cache lifetime, and signing responses are not placed in shared application caches. Do not share or log signed URLs unnecessarily. This follows [private bucket access](https://supabase.com/docs/guides/storage/buckets/fundamentals) and [signed URL permissions](https://supabase.com/docs/reference/javascript/storage-from-createsignedurl).

## Failed upload and orphan cleanup

Storage and database commits are separate. Photo states journal `pending` → `ready` or `deleting`. Failed upload/finalization attempts claim their exact unfinished reservation, remove the exact object through the Storage API, then finish metadata cleanup. A ready photo is never claimed by compensation, including a lost successful finalization response. Failed removal retains a deleting record for retry rather than forgetting its object path.

Use the photo manager’s Remove button to retry unfinished/deleting uploads while still authorized. If permission was revoked, an operator can run the bounded cleanup script from this directory with the server environment:

```sh
# Operator read-only inspection; this DOES connect to the configured project:
node --env-file=.env.local scripts/photo-cleanup.mjs
# After reviewing candidates, explicitly remove the claimed exact paths:
node --env-file=.env.local scripts/photo-cleanup.mjs --execute
```

The script lists at most 100 oldest **pending records older than one hour or deleting records**. It rechecks/locks each row before claiming it, skips ready or recently reserved photos, deletes through Storage API, and finishes metadata deletion only after the Storage object is absent. Repeat to process another batch. Credentials are not printed. Neither command is run automatically by the app, tests, build or this implementation.

Never empty the bucket, delete by a guessed facility prefix, remove unknown objects automatically, or delete `storage.objects` rows directly. Deleting Storage metadata does not remove the underlying bytes. The journal is intentionally retained if an API delete fails. If an operator manually deletes photo journal rows or uploads objects outside this reservation workflow, investigate those unmatched objects separately and verify their exact provenance before deleting; this cleanup script deliberately does not guess ownership. See [Supabase Storage schema guidance](https://supabase.com/docs/guides/storage/schema/design).

## Private conversation behavior

Contact Seller requires a confirmed account with an active owner, facility administrator or inventory editor membership in the selected approved buyer facility. The database derives the seller from an active listing at an approved facility; clients cannot specify/forge a seller or contact their own facility. A listing/buyer pair has one thread. Subsequent inquiries reuse that thread and append a message; a retried successful submission ID never appends again. Conversation and first message are one transaction.

Both facilities must remain approved for conversation reads/replies/read receipts. Eligible active participant owners/administrators/editors may read it; viewers, revoked members, unrelated facilities and platform administrators without participant membership cannot. Suspending either facility pauses access to that thread for both sides; re-approval restores history without copying/deleting it. Existing conversations can continue after the listing becomes inactive/sold, showing its current status plus safe product reference context; the buyer does not gain access to private inactive inventory fields.

`/inbox` uses the selected facility and pages 20 threads at a time. Thread history shows 30 messages per page with older/latest navigation. Authorship and facility participants are immutable, text is rendered literally, and messages are limited to 1–4,000 characters. Stable per-submission UUIDs protect first messages and replies from double submits/retries; changing payload under an existing UUID is rejected. Successful replies reset the composer and generate a new UUID. Database advisory locks serialize rate checks: **20 messages/minute and 200/hour per user; 100/minute and 1,000/hour per sending facility**, across all conversations. Duplicate successful requests do not consume additional sends.

Unread counts are **personal per account**, shown in the selected facility inbox and per thread. Opening the latest history page marks displayed history through its last sequence as read; older-page navigation does not advance the receipt. Read positions only advance, cannot be set beyond the known last sequence, and cannot be changed for another user. Use Refresh messages to check for updates. No Realtime subscription, email notification, attachment, payment or shipping feature is included.

## Two-account live Phase 3 checklist

These are required manual development-project checks; automated local tests cannot verify real Storage HTTP behavior or signed-link expiry.

1. Apply 005/006, check the private bucket settings, add the server-only photo secret and restart. Use two confirmed accounts with unrelated approved facilities A (seller) and B (buyer), in separate browser profiles. Confirm existing login/recovery, facility selection, approval, inventory edits and saved listings still work.
2. As A, create/save a listing and open its edit page. Upload actual JPEG, PNG and WebP files, select a cover, change order and save. Verify cover selection on home/search/saved cards and the full gallery on details. Remove the cover; a remaining photo becomes cover. Removing all photos shows the neutral placeholder. Inspect stored files: sanitized WebP, unique path and no original personal EXIF metadata.
3. Fill six slots and attempt a seventh via the UI and direct `reserve_listing_photo` RPC: expect rejection. Try SVG renamed `.jpg`, a text file with an image MIME claim, damaged/animated images and files above 3 MB. Server validation must reject them. With B’s normal client, try reserving/removing/reordering A’s photo IDs, uploading to a fabricated `A/listing/random.webp` path, overwriting an existing object, and finalizing a photo RPC. Expect denied/no changed rows. A direct raw upload into B’s own pending reservation must never become public or allow B to finalize it.
4. In an anonymous browser, verify active approved listing photos display through signed URLs; `getPublicUrl` for the private bucket must not expose bytes. Deactivate/mark sold as A: fresh anonymous/B signing requests must fail while A’s approved owner can still view its own photos. Wait over 60 seconds and test an old signed URL with browser cache disabled. Verify the documented short revocation window and Refresh photos behavior. Suspend A, then test fresh signing/upload/reorder requests; restore approval afterwards.
5. Exercise failures using development network interruption or an intentionally invalid server photo secret. Missing secret should fail before reservation; an interrupted upload/finalization/removal must leave no published raw image. Reload the manager, inspect pending/deleting journal rows, restore access, and retry removal or run the operator cleanup dry run, then execute after reviewing exact candidate paths. Verify a ready photo and unrelated objects/buckets remain untouched. Never simulate cleanup by deleting Storage metadata directly.
6. As B, select its approved facility, open A’s active listing and submit Contact Seller. Confirm one private thread/first message appears in B’s inbox and A’s inbox. Double-submit/retry the same request UUID; count remains one. Contact again deliberately with a new message: the existing thread is reused. A cannot contact its own facility’s listing; pending/viewer buyer contexts cannot send.
7. Exchange replies through both inboxes, refreshing explicitly. Check personal unread counts increase for the other account and clear after opening latest history. Enter literal `<script>`/HTML text: it must display as text. Try empty/4,001-character messages and rapid direct RPC sends beyond limits. They must be rejected. Send over 30 messages across permitted time windows to test older/latest pagination without lost messages.
8. Mark the listing inactive/sold as A. B cannot start a new inquiry, but the existing eligible thread can continue and clearly shows the status without leaking private stock. Suspend B, revoke a participant membership, or change it to viewer through a trusted operator: the next direct message read/reply/read-receipt request must fail without logout. Restoring eligibility restores access. Facility administrators/editors can participate with valid verified memberships; viewers cannot. This operator role-management testing does not add a role-management UI.
9. For an additional isolation check, use a third unrelated test account/facility C (or an existing nonparticipant administrator account). Guess A/B’s thread UUID, directly select message rows, forge participant/author IDs, mark B’s receipt, and call reply with another facility ID. Expect no private rows and denied writes. Platform administration alone must not provide conversation access.
10. Test phone-width layouts, keyboard-only cover/reorder/message controls, logout guards for `/inbox` and thread routes, page loading, network errors and refresh behavior. Confirm no email is sent and no hosted Storage/conversation call can fall back to demo records.

## Phase 3 automated verification and limits

The local suite applies **all six actual migrations** to PGlite. Mocked contracts supply Supabase Auth identities/API roles and Storage bucket/object tables; actual PostgreSQL RLS, restricted grants, metadata operations, Storage policies, transactions and rate limits execute against them. It covers three unrelated facilities, anonymous photo reads, private upload reservations, pending/suspended/revoked contexts, viewer/admin distinctions, forged paths/participants/authors, inactive/sold behavior, cleanup protections, gallery order/cover, duplicate messages, unread receipts and pagination. Separate tests decode real generated JPEG/PNG/WebP bytes using Sharp and mock upload/finalization/delete failures to exercise the actual compensation pipeline.

These checks **do not** run Supabase’s Storage HTTP service, actual object persistence, backend cache behavior, signed-token minting/expiry, hosted Auth/PostgREST sessions or end-to-end browser workflows. Your previously tested Phases 1/2 configuration was preserved. No remote migrations, bucket configuration, cleanup script or deployment was run. Use the live checklist above before treating Phase 3 as verified against the hosted project. Verification builds use process-only local placeholder URL/key settings and no secret; rebuild normally with your actual `.env.local` before `npm start`.

Latest Phase 3 local result: **49 tests passed**, lint passed with no warnings, and production builds passed in both demo and connected modes. Local production HTTP smoke checks with an unavailable localhost Supabase endpoint verified anonymous inbox/thread redirects and connected marketplace failure without fictional stock. This is not successful hosted Auth or Storage testing.



## Shared facility messaging and header notifications (October 11)

After 006, apply **20261011000700_message_notifications.sql** through the same authorized migration process. No migration was applied remotely during implementation. This adds two restricted RPCs, with no new environment variables, tables, bucket changes or privileged credentials:

- my_message_facilities() returns only the caller's eligible approved facility IDs/names and personal unread counts. It checks live membership, confirmation, actual ownership for owners, and both conversation participants' approval. Anonymous callers have no execute permission; viewers and nonparticipant platform administrators receive no facility summaries.
- select_message_facility(uuid) rechecks the same eligibility before setting the existing account active-facility selection. Pending, suspended, revoked, viewer and unrelated facility selections are denied through direct RPC requests too.

The inbox/thread dropdown includes eligible approved facilities and their unread counts. Switching returns to the selected facility inbox and also changes the account's active facility for inventory workflows. Pending facilities can still be selected through My account to view onboarding status. A composer opened before a facility change in another tab rejects sending until refreshed.

Conversation history is facility-shared, not a private inbox for each member. One listing/buyer-facility thread is reused by all eligible colleagues. Contact Seller opens that existing thread when available so colleagues review earlier inquiries first. This coordinates inquiries; it does not reserve a product, prevent all simultaneous commitments, or add purchases. Personal read cursors remain independent, so one member opening a thread does not remove another's unread indicators.

The connected header bell beside My account appears across pages and counts personal unread messages across eligible facilities (including other colleagues' messages). Clicking opens the inbox; the dropdown identifies which facilities have unread messages. Updates occur on navigation, reading/replying and every 30 seconds while the tab is visible. Hidden tabs pause polling. Messages have New to you labels, and inbox rows retain unread badges. Network/setup errors produce an unavailable indicator, not an apparent zero count. The ordinary authenticated API uses private no-store responses; it never uses the photo administrator key. There is no Realtime or email delivery change. Use Refresh messages inside the inbox/thread for new history.

Additional manual live checks after applying 007:

1. Have a trusted operator attach a confirmed test account to two unrelated approved facilities using eligible roles. There is still no self-join, invitation or membership-management UI. Confirm the dropdown lists only its eligible approved facilities; switch and verify the correct shared inbox and sending name. Check switching resets inbox pagination. Leave a composer open in another tab, change facility and confirm the stale composer refuses to send.
2. With two eligible colleagues in the same buyer facility, contact the same seller listing. Both must see the same thread/history, and Contact Seller must link to it after creation. Confirm a third unrelated facility cannot see it, including direct RPC/table reads. Existing database uniqueness also prevents two simultaneous submissions from creating separate threads.
3. Send a seller reply. Both buyer colleagues see personal unread badges, including the header bell while browsing marketplace/account/dashboard. Open the thread as one colleague: only that user's count clears; the other remains unread. Confirm navigation/read/reply refresh and visible-tab polling work, and hidden tabs stop polling. Test more than one facility with unread messages and switch to the inbox identified by the dropdown count.
4. Revoke a membership, suspend either participant, change a membership to viewer, and test unconfirmed/anonymous identities. Check fresh summary/selection RPCs cannot leak counts or grant access; the bell drops inaccessible counts on its next check. Existing signed-in UI may display the previous count until the next poll, but database operations recheck immediately. Restore eligibility and verify access returns.
5. Interrupt network access or test before applying 007: the header must show an unavailable indicator and inbox an actionable error, with no fictional fallback. Test phone-width header placement and keyboard access to bell/dropdown, then regression-test account, approval, inventory, photos and saves.

Local automated tests execute all seven migrations in PGlite with the existing mocked external Auth/Storage contracts, including shared-thread uniqueness across colleagues, independent unread cursors, multiple facility switching, unrelated/pending/viewer/revoked/suspended denials, and cross-facility notification privacy. Hosted/browser checks above remain manual.

October 11 local verification: **53 tests passed**, lint passed without warnings, and the production build passed with the existing local environment configuration. No remote migration, service configuration or deployment was performed; the new browser/hosted checklist remains manual.


## Saved listing change notifications (October 11)

Apply **20261011000800_saved_listing_notifications.sql** after 007 through your authorized migration process. No remote migration was applied by the assistant. No new environment variables or privileged credentials are needed.

An RLS-protected saved_listing_updates table records private per-user events for future changes to saved listings. An AFTER UPDATE trigger runs inside the same inventory transaction, including direct guarded inventory RPC calls. One event per user/listing/revision combines changed fields; unchanged saves/revision bumps do not create notices. Existing saves are watched going forward, with no invented history or retroactive backfill.

Tracked changes: sold/deactivated/reactivated status, quantity, quantity unit, package count, USD price, condition, expiration and other listing details. Notes changes produce a generic details-updated notice without copying free-form notes. Photo changes and canonical catalog corrections are not tracked in this version. Sold/deactivated transitions from active approved stock expose only the status; edits to inactive/sold or suspended-facility stock do not disclose private quantities/prices or generate further private-state notices. Reactivation can notify newly public changes. Historical notices describe formerly public information at the event time, and the UI links to a listing only while it is currently public. This grants no private listing access.

The header bell now totals unread facility messages plus unread saved listing updates, polls on the existing 30-second visible-tab schedule, and opens **/notifications**. That page separates messages and listing changes, retains personal messaging read behavior, pages listing history 20 rows at a time, and provides individual or displayed-page Mark as read actions. Merely viewing notifications does not clear listing alerts. Marking displayed IDs does not clear concurrent/new or undisplayed events. Listings can be saved without an approved facility, so these notifications remain account-owned and independent of facility selection or membership. Unsaving a listing cascades deletion of only that user's related notification history; resaving starts following future changes again.

Ordinary clients have only own-row SELECT access to the event table, no direct writes. Trigger creation is private; marking is a caller-checked, bounded RPC with no arbitrary user-ID parameter. A mixed list containing another user's event is rejected atomically. Platform administration and facility ownership do not grant access to another person's notifications. The existing /api/message-notifications endpoint now returns both counts with verified Auth and private no-store responses; a failed check produces an unavailable indicator, never a successful-looking zero or demo fallback. No email or Realtime integration was added.

Live checklist after 008:

1. As two unrelated confirmed accounts, save the same seller's active listing. As its approved seller, change quantity, package information and price (including zero). Each saver should receive one event per successful changed revision and an increased bell count within 30 seconds or on refresh/navigation. Confirm the displayed USD amount/unit and details, and verify an unchanged edit creates no extra notice.
2. Mark sold or deactivate. Both savers should see a status-only notice and an unavailable listing message. Change quantity/price/notes while inactive/sold: no new private-data notice should appear. Reactivate and verify renewed public availability. Suspend the seller and verify fresh notification responses disclose no new private edits. Previously public event history may remain visible to its owner.
3. Open /notifications as one saver; viewing should not clear badges. Mark one event or the displayed page read and confirm only that account's count decreases. Messages should retain their independent unread counts. Produce more than 20 events to exercise pagination, then create a new event before marking a previous page: the newer event must remain unread.
4. Using ordinary user clients, attempt direct INSERT/UPDATE/DELETE on saved_listing_updates, select another saver?s events, and submit their event UUID to mark_saved_listing_updates_read. Expect denied writes/no foreign rows. A platform administrator without ownership of the save gets no notification access. Anonymous requests must not expose private notifications.
5. Unsave as one account: only its listing notification history disappears. The other account's events remain. Resave and confirm no prior events replay, while future edits notify again. Check a pending/no-facility account still sees its own saved updates without gaining messaging or seller permissions.
6. Test the combined bell, notification loading/error/retry, keyboard/phone layouts, and network failure. Existing account, facility inbox, photos, inventory and saves should continue working. Record these hosted/browser results separately from local SQL tests.

Latest saved-notification verification: **59 local tests passed** with all eight actual migrations and external Auth/Storage contracts mocked, lint passed without warnings, and production build passed. Tests include transactional fanout/rollback, no-op suppression, private-state protection, direct-write/foreign-read denials, atomic and idempotent acknowledgement, unsave/resave behavior, and pagination/concurrent-new-notice preservation. Hosted/browser verification remains outstanding.


## Owner feedback: types, contacts, inventory, watchlists and referrals

Apply in order after 008 (do not reapply older migrations blindly):

1. **20261011000900_owner_feedback_inventory.sql**: new facility types, expanded transactional onboarding validation, per-listing negotiable asking price/procedure/inventory classification, optional canonical product classification, immutable shared reference behavior, safe public facility/type/procedure search, deletion guard and updated saved-listing change notices. Old search RPC remains compatible; application calls search_inventory_v2.
2. **20261011001000_facility_contacts.sql**: immediately RLS-protected contacts, owner/admin-only maintenance, transactional optional backup contacts during onboarding, and opt-in business-contact projection for eligible approved buyers on active listings. Backup contact details are never public and grant no membership, recovery or ownership rights.
3. **20261011001100_watchlists_referrals_email.sql**: immediately RLS-protected watchlists, match history, referrals and private email outbox; guarded referrals and service-only claim/receipt RPCs. Ordinary clients retain publishable-key-only operations. No automatic cron/hosted service configuration occurs.

Existing products/listings are not clinically classified by guesswork: old stock defaults to procedure Other and unclassified inventory type, and old canonical references may have no type. Sellers choose Capital/Disposable and procedure when creating/editing. These facility listing classifications do not overwrite a reused shared product. Negotiable is a flag on an explicit USD asking price; a seller may use zero and mark negotiable when there is no minimum. Saved notifications include negotiability, procedure and listing type changes.

Deletion is a separate confirmed withdrawal from dashboard/public search, implemented with deleted_at and inactive status. It cannot be edited/reactivated through ordinary RPCs. Conversations and historical saved notices remain; saves show unavailable entries. Photos/metadata stay private and associated with the retained listing, rather than being treated as orphans or deleted through a bucket sweep. This is not a data-erasure operation. A future operator retention/purge policy would need to account for conversation history and Storage deletion safely. Deactivate/Mark sold remain reversible through Reactivate.

New pages: /about, /faq, /account/contacts, /watchlist, /refer. Footer/account links expose them. FAQ/About contain accurate starter copy with an owner-review notice, not invented company history. See OWNER_FEEDBACK.md for the full feedback audit and catalog expansion decision.

### Optional email setup (separate from Supabase Auth emails)

The delivery adapter uses the official [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email) with plain text and [idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys). This is an optional provider choice implemented behind a small adapter in scripts/email-delivery.mjs; substitute another provider there if needed. No dependency or hosted email account was added.

Add to ignored .env.local or your server/worker secret environment (placeholders are in .env.example):

- H2H_EMAIL_ENABLED=true only when you intend to enable email features and run the worker. Defaults off.
- RESEND_API_KEY: server-only provider send key; create/configure it manually. Never NEXT_PUBLIC.
- H2H_EMAIL_FROM: verified provider sender, for example Hospital2Hospital <invites@your-verified-domain.example>. Verify the sender domain and any provider testing-recipient restrictions through the provider dashboard; placeholder addresses cannot deliver.
- SUPABASE_EMAIL_SECRET_KEY: dedicated server-only Supabase key mapping to service_role for the **email worker only**. Ordinary users queue referrals/matches through guarded operations; they never use this key. It is separate from the isolated photo key/client.
- Existing NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SITE_URL must identify the intended project and app origin; links in messages use the configured site origin. Worker also needs these settings. No Supabase Auth template/SMTP changes are made by this delivery adapter.

Commands from this project:

    node --env-file=.env.local scripts/email-worker.mjs

Default is a **local configuration-only check**, with no service connections, recipient output, mutation, or email send. It is safe to use before enabling the service. Real delivery requires an explicit operator execution:

    node --env-file=.env.local scripts/email-worker.mjs --execute

**--execute connects to Supabase and sends real emails**; do not run during implementation without authorization. Set up an operator-run process or scheduler to execute this command every few minutes, with the environment supplied securely. Nothing schedules it automatically. A run claims at most 20 jobs, checks current confirmed recipient/membership/facility/listing eligibility, and paces provider requests; configure frequency/limits for your provider. Do not claim that configuring keys alone proves the worker is running.

The outbox is transactional with matches/referrals. Leases use SKIP LOCKED, a 10-minute claim timeout and claim tokens; finish rejects old tokens. Provider idempotency uses the immutable email job UUID. Retries are capped at five attempts and 23 hours from creation, within the documented 24-hour provider key retention; older jobs are marked failed, not blindly resent outside that guarantee. Never manually requeue a sent/ambiguous job with a new id without investigating the provider receipt first. Provider acceptance is recorded as sent, **not proof of inbox delivery**; check provider delivery/bounce records during live verification. Raw provider errors and recipient addresses are not printed by the worker.

Pausing/deleting a watch or disabling email cancels eligible unclaimed jobs on the next worker claim; deleting a watch cascades its match/queue history. Changing verified email cancels jobs for the old address. A listed match can become unavailable before email delivery; the worker skips unavailable stock. An email already accepted or in flight may still arrive after unsubscribe or status changes; delivered messages cannot be recalled. Each watch/listing pair matches once, so price edits and repeated reactivation do not spam emails. New watches do not generate a retrospective inventory digest. Match history remains personal and contains only formerly public product reference information; detail links may become unavailable.

Referrals require a confirmed, active owner/administrator/editor at a selected approved facility. They include the caller's display name and facility, not personal Auth email or backup contacts. Limits: 10 referrals/day/user and one invite/address/seven days across facilities; stable UUID retries do not consume extra invitations. An invitation grants no account, approval, facility membership or administrator status. UI reports queued, not delivered. No messages or saved-change alerts are emailed in this phase; optional watchlist new-stock alerts and explicit referrals are the only delivery types.

### Manual workflow checklist

1. Register/onboard Surgical Hospital, Physician Office and Other with an optional secondary contact. Verify pending status, owner membership, private backup details and confirmation/recovery regressions. Try malformed contact data through the RPC: onboarding must fully roll back. Retry an onboarding UUID without overwriting subsequently maintained contact details.
2. As the owner/admin, edit contacts; other facilities, viewers and anonymous callers must not read/change them. Share a designated business contact explicitly, then check an approved unrelated buyer sees only business name/email/phone alongside Contact Seller. Pending/viewer/revoked buyers, suspended sellers and inactive/sold listings get no business projection. Switch facility in another tab and ensure stale contact/referral forms refuse to submit.
3. Create a missing catalog item using existing/new manufacturer, SKU/description, capital/disposable inventory and procedure. Reuse the same manufacturer/SKU with different shared metadata: the canonical reference must remain unchanged. Set negotiable, including a zero asking price; verify cards/detail/dashboard and saved alerts.
4. Use public Facility, Procedure and Capital/Disposable filters combined with manufacturer/category/location. Check URL refresh/back/pagination. No membership/account/contact details should appear in filter JSON. Classify an older unclassified listing as seller without changing the shared reference.
5. Deactivate/mark sold and reactivate with verified quantities. Separately delete a listing: it disappears from public/dashboard search, rejects direct edit/reactivation and retains existing eligible conversations. Other facility users must not be able to delete it. Confirm existing photo policies and private saves still work; do not sweep retained photos as orphans.
6. Create/edit/pause/remove a watchlist; use exact manufacturer+SKU to distinguish identical catalog numbers across manufacturers. Publish a matching listing as another approved facility: one private match should appear. Wrong manufacturer/procedure/type and inactive/suspended stock should not match. Retried/repeated activation must not duplicate a match. Test direct foreign watch reads/updates and attempts to manufacture match/outbox records: deny.
7. Configure the provider sender/worker explicitly, opt in to watch emails, publish a new match and run an authorized delivery batch. Verify actual mail, plain text, correct verified destination/site link and ability to turn email off at /watchlist. Simulate provider failure/lost acknowledgement: the same job/idempotency key is retried, never a new arbitrary recipient. Pause/delete/sell/suspend/unconfirm/change email before claim and verify cancellation. Review failure/expired jobs manually rather than bulk requeue.
8. Refer a consenting test recipient from an approved facility. Verify one queued invite on a repeated UUID, its sender name/facility, actual email delivery, registration link, and ordinary approval flow without automatic membership. Test viewer/pending/revoked referrers, altered payload/UUID reuse, daily limit and repeated recipient/address interval. Email-disabled UI should explain setup and send nothing.
9. Review About/FAQ on phone and keyboard, supply final owner copy, and regression-test auth, approval, stock, photos, shared inbox, saves and bell notifications. Keep hosted checks separate from local tests and mocked provider transport.

Latest owner-feedback local verification: **74 tests passed** with all eleven actual migrations and mocked external Auth/Storage contracts/email transport; lint passed without warnings and production build passed. Coverage includes transactional contact onboarding, private/opt-in contact reads, expanded filters and immutable reference reuse, delete/history authorization, watch matching/private ownership/limits, verified-recipient queues, claim exclusivity/token rejection, cancellation after live eligibility changes, referral idempotency/limits and expiry within provider idempotency retention. Only the local configuration-only worker check was executed; no real email, hosted migration, service scheduling/configuration or deployment was performed.


## Find navigation and private support tickets

Apply **20261011001200_support_tickets.sql** after 011. This creates an immediately RLS-protected support_tickets table, guarded submission/status RPCs, and a private support-screenshots bucket (5 MiB, stored WebP only). No hosted migration or bucket configuration was performed here. Storage policies follow the official [Supabase access-control guide](https://supabase.com/docs/guides/storage/security/access-control), with restrictive fences so unrelated broad policies cannot expose this bucket.

The shared header places Find directly after Dashboard. Hover reveals FAQ, About, Refer a facility, Watchlists and Get Help; click/tap, Tab/Enter, Arrow Down and Escape also work. Get Help is linked from the footer. The narrower header wraps navigation to preserve phone/tablet layout.

/help is public to visit. A confirmed signed-in user can submit tickets, even without facility membership/approval or after facility suspension/revocation. Contact email and name are prefilled from Auth/profile; facility defaults to the selected facility name and remains editable as a user-entered support context (it grants no membership). Contact name/email and issue are required; phone/facility and one screenshot are optional. Issue length is 10-5000 characters and tickets are limited to five/account/day. Stable submission UUIDs prevent retry duplicates. The server derives immutable account identity/email independently of editable contact fields. User-supplied privileged fields, ownership/status changes and direct writes are denied.

Tickets are private to the submitter and platform administrators, **not shared with all facility colleagues**. /help pages the user's history ten tickets at a time. /admin/support pages all tickets and allows open/in_progress/closed status changes; My account links to this screen only for platform administrators. Facility administrator/owner roles alone do not grant platform support access. No automatic support emails, ticket replies, attachments besides the single screenshot, or promises of response time were added.

Signed-out/unconfirmed visitors are offered login, confirmation/recovery help and FAQ rather than anonymous submissions. Optionally set **H2H_SUPPORT_EMAIL** to a public business support address for visitors unable to sign in. This address is intentionally displayed publicly; never put a secret or private account address there. Anonymous ticket collection is not implemented and would need a separate abuse/verification design.

### Optional screenshot configuration

- Add **SUPABASE_SUPPORT_SECRET_KEY** to the ignored server environment for screenshots only. It is a dedicated server-only key mapping to service_role; never NEXT_PUBLIC and never passed user cookies. Text-only tickets use the ordinary publishable client and need no privileged key. The form disables screenshot selection with an explanation when this key is absent.
- Input supports one actual JPEG/PNG/WebP up to 3 MB (3,000,000 bytes). The existing Sharp full decode/re-encode validation rejects SVG/fake/damaged/animated images, strips metadata, caps 20 megapixels and stores sanitized WebP up to 2400px per side. The 4 MB Server Action body limit accommodates one file plus the ticket text. Both initial and retry screenshot inputs enforce the 3 MB file limit before submission.
- SQL generates and stores an exact unique ticket/UUID.webp reservation path. Ordinary Storage insertion requires the caller's pending reservation and confirmed identity, never a guessed facility/path prefix. No overwrites. Raw direct uploads remain pending; ordinary callers cannot certify them. A server-only finalize RPC validates uploader/session, dimensions, size and Storage metadata after the server has decoded the content.
- Pending bytes are accessible only to their own uploader to allow exact retry/removal; staff review and app signing/rendering only expose **certified ready** screenshots. Unrelated users, anonymous visitors and facility colleagues cannot read them. Ready screenshots can be read by the submitter or platform administrator; DELETE/UPDATE policies protect ready files from upload-failure compensation.
- Screenshot validation/config failures occur before ticket creation. If Storage/finalization fails later, ticket text stays saved and the form reports its reference. Retry the unchanged form, or use Retry screenshot upload on the pending ticket card after reload. Retries are allowed within 24 hours. A lost successful finalize response cannot delete a ready file because Storage removal rechecks pending state; a retry returns the same ticket and skips already-certified uploads.
- Ordinary caller RLS signs private reads for 60 seconds; Image is unoptimized and support responses are private/no-store. Refresh to renew links. Bearer links already issued may remain usable until expiry after permission changes; downloaded/cached bytes cannot be recalled. Screenshot/issue text should exclude patient details, passwords and API keys.

### Pending screenshot cleanup

    node --env-file=.env.local scripts/support-cleanup.mjs

Default is **local configuration inspection only**, no network or deletion. After explicit operator authorization:

    node --env-file=.env.local scripts/support-cleanup.mjs --execute

--execute connects and mutates the configured project. It processes at most 100 pending tickets older than 24 hours, rechecks exact stored paths through service-only RPCs, removes bytes using Storage API, and only clears metadata after the object is absent. Expired reservations cannot upload/finalize, so they cannot turn ready during cleanup. Ready/fresh/unrelated files and ticket text are retained. Storage deletion failure keeps the pending journal. Never sweep the bucket or delete storage.objects metadata directly. No cleanup was run remotely and no scheduler is installed. Longer-term ticket/ready-screenshot retention or account erasure policies remain operator decisions.

### Live checklist

1. Apply 012, check private bucket/settings, configure optional support key/business fallback email and restart. Test Find hover, touch tap, Tab/Enter, Arrow Down, Escape and keyboard focus through all five links at desktop/tablet/phone widths. Footer Get Help must work on all pages.
2. As a confirmed user, submit name/email/phone/facility/issue without screenshot. Verify prefilled Auth email is editable as contact email, while the administrator audit still shows the true submitting account. View the created ticket reference/history. Retry the same UUID: one ticket. Another user/colleague must see no ticket or sensitive contact data, including direct table/RPC requests.
3. Submit actual JPEG/PNG/WebP screenshots and view them as submitter/platform administrator. Anonymous, another facility member and facility administrator without platform privileges must be denied reads/signing. Forged paths, overwrite attempts, direct certification and direct support INSERT/UPDATE must fail. A pending raw direct upload must never appear as a certified staff screenshot.
4. Try SVG renamed as an image, damaged/animated/oversized files and missing/invalid support key. Verify actionable error states. Simulate network upload/finalization failure: text ticket survives, pending retry appears, and recovery does not delete unrelated/ready files. Refresh after 60 seconds to renew signing; inspect actual Storage/token expiry separately from local tests.
5. Verify pending/suspended/revoked facility users can still ask for help without regaining inventory or conversation access. Anonymous/unconfirmed users get login/recovery/FAQ (and configured public business contact), not a public ticket API. Test five-ticket/day limit, 5001-character issue, malformed email and attempts to forge user/status fields.
6. As a platform administrator, open My account -> Platform support tickets, view the issue and certified screenshot and set status. The submitting user should see updated status after refresh. Revoke platform administration and confirm fresh review/status/signing calls fail. No support email should be sent.
7. With an authorized operator, inspect/recover an expired pending screenshot using exact-path cleanup; verify fresh/ready screenshots and issue/contact text remain untouched. Do not execute cleanup automatically during implementation or tests.

Latest support local verification: **81 automated tests passed** against all twelve migrations with mocked external Auth/Storage contracts and upload failures; lint passed without warnings and production build passed. Real Sharp image validation tests remain included. Support isolation tests cover even same-facility administrators, forged status/ownership/paths, service-only certification, broad-policy resistance and safe stale cleanup. Header ordering/footer links were checked in source. Browser hover/touch/keyboard behavior and hosted Storage HTTP/token expiry remain manual checks; no remote migration, upload, cleanup or deployment was performed.

## Account dropdown, profile editor and headshots (migration 013)

Apply `supabase/migrations/20261011001300_profile_avatars.sql` after 012 using your normal reviewed migration process. No remote migrations were applied during implementation. No additional environment variables, Storage bucket or privileged key is needed.

The connected My account button reveals Account home, Edit profile and Log out on hover, click/touch or keyboard. The native modal edits display name and headshot; verified Auth email remains read-only. Save changes starts disabled, enables only for a changed name/image/removal, and stays disabled during submission. Cancel/Escape discard edits; cancellation is blocked during a save. Server errors stay in the modal for retry.

Headshots accept actual non-animated JPEG/PNG/WebP up to 3 MB (3,000,000 bytes) with the existing 20-megapixel decoder limit. The server fully decodes, strips metadata and crops/re-encodes a 256px square WebP capped at 128 KiB. These small account-private images are stored inline in `profile_avatars`, with own-user SELECT RLS and no ordinary direct write grants. The caller-only transactional RPC validates the bounded WebP envelope, updates only the caller name/image, and accepts no user/facility/role parameters. SQL checks the format envelope/size; full image decoding occurs in the app, not PostgreSQL. Even direct RPC content renders only as a fixed WebP data image, never arbitrary URLs or SVG/HTML. No orphan-file cleanup or expiring signed URL is required; replacement/removal and account deletion remove the previous inline image. This choice is suitable for small headshots; revisit private Storage if larger profile media is added.

The account page shows the selected facility's business name/email/phone beneath the user's name/email. A caller-only RPC rechecks confirmed identity, live active membership, and owner identity where applicable. It exposes no backup contacts or contact records from other facilities. Internal business contact display is available to active members even while their facility awaits approval or is suspended; buyer-facing contact sharing still follows the existing approved-buyer/opt-in rules. Existing private contact editing remains owner/administrator-only.

Manual hosted/browser checklist (not executed locally):

1. Apply 013 and refresh the schema cache if needed. Set the designated business contact in Account home > Manage facility contacts. Check it appears beneath your identity; switch active facilities and verify the contact changes.
2. Hover/click My account; use Tab, Arrow Down and Escape as well. Verify Account home and Log out still work.
3. Open Edit profile. Verify Save changes is gray/disabled initially. Change the name, save, and reload Account home. Reopen, edit then Cancel/Escape: nothing should persist.
4. Upload a JPEG/PNG/WebP headshot, save, and reload. Check the header and account page. Replace/remove it, cancel a replacement, and test SVG, corrupt bytes and >3 MB rejection.
5. In a second account, verify the first user's avatar/profile stays private through direct API reads/writes and that unrelated or revoked memberships cannot read its facility business contact. A platform administrator without membership gets no contact/avatar override.

Local automated tests execute migration 013 with all previous migrations, own-user RLS and caller-only RPCs in PGlite; they decode real images with Sharp and test invalid uploads, unconfirmed/anonymous callers, forged facility selection, revoked membership, unrelated users and administrator isolation. They do not exercise hosted Supabase or browser interactions.

## Marketplace landing, filter popup and featured listing review (migration 014)

Apply `supabase/migrations/20261011001400_featured_listings.sql` after 013. Implementation did not apply remote migrations, change hosted settings, or deploy. No new environment variables, keys or payment configuration are required.

Opening / now redirects to /marketplace, preserving string query parameters. Login and ordinary confirmation callbacks also land on Marketplace. Recovery still lands on the password update screen; onboarding submissions still return to the account status page.

Marketplace/Saved keep search prominent, with Show filters and Clear filters immediately below. Show filters opens a native dialog with existing category, manufacturer, facility, procedure, product type, location and sort choices. Apply uses a GET request and resets pagination, keeping state in the URL. Search retains applied filters. Cancel/Escape discard draft filters; reopening restores the applied values. Clear filters retains the search keyword and resets filters/sort/page. Demo browsing uses the same popup and URL state for its supported fields; it never reads connected inventory.

Featured Listing shows up to two administrator-selected listings beside the Marketplace heading (stacked on smaller screens). These placements are independent of search filters, and do not change ordinary result ordering/counts. Empty placements have an honest empty state; service failures display an error rather than demo stock. Private listing photos use the existing 60-second signed URL rules.

From My Facility, Boost a listing appears beside Create listing with a lighter teal background. Approved active owners/inventory editors can select among their eligible facilities and active listings, without changing their account's active facility. Dropdown inventory is refreshed on opening and bounded to 500 active listings per facility; the UI explains that limit when reached. No stock is eligible simply because its facility ID was submitted. The guarded RPC derives facility identity from the listing and rechecks current facility/membership/ownership and listing status. Only one request per listing exists: repeated pending/approved submissions are idempotent; rejected/ended requests can be resubmitted for fresh review. Recent request statuses/review notes appear in the owning facility dashboard.

Platform administrators reach /admin/featured through Account home > Featured listing review. The queue has 20 requests/page, safe product/facility context, revision-based stale-review rejection, and Approve / Reject / Remove decisions. Approval explicitly assigns slot 1 or 2; choosing an occupied slot replaces its current feature and marks that previous request ended. Moving an approved request frees its previous slot. Slot selection is serialized transactionally and constrained in SQL to two unique placements. Ordinary users have no direct request/slot mutation grants and cannot self-approve, transfer ownership, or access unrelated requests. An administrator without facility membership can review boosts but gains no inventory editing, private messages, photos, backup contacts or account-data access.

Public featured reads return only the existing safe public inventory projection, with active/nondeleted/approved visibility checked in the same database statement, even for callers who could otherwise view their own private inventory. Sold/inactive/deleted/suspended stock disappears immediately on the next page read. Slots persist until manually replaced/removed; reactivation/reapproval can make the same selected listing visible again. There is currently no expiration, rotation, email notification, paid checkout, fee or guaranteed placement. These operational choices should be revisited before any future paid feature.

Manual hosted/browser checklist (not executed during local implementation):

1. Apply 014 and refresh schema cache if needed. Open the site root logged out; verify Marketplace. Log in and confirm Marketplace still opens. Test email confirmation and recovery separately; recovery must still open password update.
2. Search, open Show filters, change several fields, Cancel/Escape, and reopen: results/applied selections stay unchanged. Apply filters, reload/share the URL, and paginate. Search again and verify filters remain. Clear filters and verify the keyword remains. Test mobile sizing and keyboard focus/cancellation.
3. With two unrelated approved facilities, open My Facility > Boost a listing. Select a facility then an active listing and submit. Confirm its pending status, duplicate submission behavior, and that unrelated facilities/listings never appear. For a multi-facility member, both eligible facilities should appear; selection must not change account active facility.
4. Log in as a separate platform administrator, open Account home > Featured listing review, and approve into slots 1/2. Visit Marketplace anonymously and verify two actual listings/photos link to details. Replace a slot, move a feature, reject/remove a request, and confirm the seller's status updates.
5. Mark a featured listing sold/inactive or suspend its facility: it must disappear. Reactivate/reapprove and confirm the retained-slot behavior. Delete it and verify it stays hidden. Refresh after changes; previously signed photo URLs may remain usable for their original 60-second lifetime.
6. Try direct RPC/table requests as unrelated, viewer, pending, suspended or revoked members. Request/slot identity/status cannot be forged, facility owners cannot approve, non-admins cannot read the queue, and stale admin reviews must fail.

Local automation executes all actual migrations/RLS in PGlite, covering anonymous reads, unrelated facilities, owner/editor/viewer roles, pending/suspended/revoked contexts, duplicate requests, protected direct writes, self-approval denial, slot replacement/removal/resubmission, stale revisions and unavailable featured visibility. This models Supabase Auth contracts; it does not test hosted Supabase, browser popups, real concurrent HTTP traffic or live photo signatures.


## Authenticated camera and phone uploads (October 15)

Apply **20261015001500_listing_drafts.sql** after 014, before deploying this version. This is a new migration: do not rerun historical migrations. It adds the draft status to existing listings, a private RLS-enabled idempotency journal for transactional draft creation, and a private photo submission UUID with a guarded retry operation. Existing listing/photo/Storage policies continue enforcing the actual facility and live membership; the QR code does not grant access. No hosted migration or deployment was performed during implementation.

No new environment variables or buckets are required. Keep the existing server-only photo certification credential. QR codes are generated by the server using qrcode, with no third-party QR service or disclosure of the link. NEXT_PUBLIC_SITE_URL must be the exact reachable HTTPS site origin: phone links use that configured origin. A phone cannot reach your computer through localhost. Email and SMS delivery are not part of this feature. Existing Supabase email callback URLs/templates do not change; the phone-login return is an allowlisted internal page, not an email redirect.

### Listing workflow

1. Create listing: complete product and required inventory details, then choose **Save private draft and add photos**. Draft creation never publishes stock, even if a caller submits active status. Shared products remain canonical and are resolved transactionally using the existing operation. Retries of the same unchanged submission reuse its draft; changed requests with the same UUID are rejected.
2. In the draft editor, use **Take a photo** or **Choose existing photo**, review the preview and choose **Upload this photo**. Cancel photo discards the local preview. Upload one photo at a time, up to six ready/pending slots. Existing listings use the same controls.
3. Browser preparation accepts actual JPEG/PNG/WebP originals up to 20,000,000 bytes and 20 megapixels/10,000 pixels per side, applies image orientation, rejects known animation containers, resizes to at most 2,000px per side and produces a JPEG at or below the existing 3,000,000-byte upload limit. Larger originals stay on the device. HEIC/HEIF and SVG are not accepted; use a JPEG export or compatible camera format. Camera behavior and image decoding depend on the browser. The server independently decodes and sanitizes the uploaded file to WebP; its 4,000,000-byte request cap and private certification remain unchanged. The preview is a temporary browser object URL and is released when replaced, cancelled or unmounted.
4. **Upload from phone** opens an inline QR/link card. Scan it or copy/open its link. An eligible owner or inventory editor must sign in on the phone; login returns to that exact listing's photo page. Neither a forwarded link nor platform administrator status alone grants access. This page checks the actual listing facility, independently of the selected active facility, and never silently changes the global facility selection. To edit full listing details, select that facility in My account first.
5. Photo metadata and fresh signed image URLs poll every 20 seconds in visible tabs, with a manual refresh option. Only the photo panel updates: polling does not reload the inventory form or overwrite unsaved listing fields. Signed URLs still expire after 60 seconds and previously issued bearer URLs may work until expiry. Failed refreshes show an explicit error, never demo content. Removals and cover/order saves also refresh the photo panel. Pending/deleting reservations can be removed with the existing guarded cleanup flow.
6. After saving any listing edits, choose **Publish listing**, or select Active in the editor and Save changes. Publishing rechecks live facility approval, role, identity and expected listing revision. Photos remain attached to the same listing. Drafts are excluded from public reads, saves, inquiries, featured placements and watchlist publication alerts. First publication uses existing inventory triggers. The dashboard includes Drafts and permits normal guarded deletion.

### Retry and abandoned-draft policy

The photo submission UUID is stable while retrying the same selected photo. If finalization succeeded but its response was lost, the guarded reservation returns the existing ready photo rather than uploading again. A still-pending submission returns an actionable refresh/remove error; it is not overwritten or deleted by another retry. Selecting another photo creates a new submission UUID. Six-slot reservation locking still applies across both devices.

Drafts are retained privately until published or deliberately removed; at most 100 live drafts may be created per facility through the draft operation. There is no automatic draft purge or new background service. Owners/editors can review Dashboard > Drafts. For an abandoned draft, remove unwanted photos through its photo manager first, then delete the draft. Normal soft deletion retains any remaining historical media; it is not a bucket sweep or immediate erasure. Existing photo-cleanup.mjs remains limited to its exact stale pending/deleting journal paths and requires explicit operator authorization to execute. Never remove other files or all objects sharing a facility prefix. A long-term automatic draft/ready-media retention policy remains a separate decision.

### Two-device hosted checklist (manual, not performed locally)

- Apply 015 on the intended project, deploy, verify NEXT_PUBLIC_SITE_URL and the existing photo secret, then use a desktop and a real phone on the same deployed HTTPS site.
- Owner A creates a draft; anonymous users and facilities B/C must not see its stock or photos through direct database/Storage reads, search, saves, inquiry creation or featured selection.
- In desktop editor A, type an unsaved seller-note change. Open Upload from phone. Scan on a signed-out phone, log in as A, and verify return to the exact listing/facility. Upload, reorder, select cover and remove photos. Verify desktop photos update while the unsaved note remains untouched. Save details before publishing.
- Repeat with an authorized inventory editor whose selected active facility differs. Upload must work without changing that selection. Repeat as unrelated B/C, viewer, pending/suspended facility, revoked member and a platform administrator without participant membership: no upload access. Change approval/membership while the photo page is open; API refresh and mutations must deny further operations.
- On iPhone Safari and Android Chrome, test rear-camera capture, gallery choice, portrait orientation, JPEG/PNG/WebP, a large supported original compressed below 3 MB, HEIC fallback guidance, corrupt/SVG/animated input, cancellation and a slow/interrupted network. Validate real Storage bytes, private signing and 60-second expiry separately.
- Fill six slots concurrently from both devices; a seventh must fail. Retry a lost successful response: one ready photo only. For an unfinished reservation, refresh/remove it and retry safely. No unrelated files may be deleted.
- Publish the reviewed draft: same listing/photos become public and existing watchlist matching works. Drafts must never generate premature match emails. Test stale publish revision and suspension/revocation before publish. Delete another draft and verify it disappears from the dashboard without disturbing any other listing's photos.

Local verification executes actual migrations/RLS/Storage contract tests in PGlite and upload failure/duplicate retry tests; it does not certify hosted Storage, real camera permissions or physical-device behavior. The implementation was checked with headless Chrome for actual image preparation and anonymous login/API behavior. npm audit reported five high-severity advisories in the existing lint-tooling dependency chain (braces/micromatch/fast-glob/eslint-config-next), not qrcode; no forced framework downgrade was performed.


## One-time owner password recovery without SMTP

The operator-only tool scripts/recover-owner-password.mjs targets only paul@babursolutions.com in https://rmgvchexfacjigukyvrx.supabase.co. It is never imported by the app, run by builds or exposed through a route. It uses the existing server-only SUPABASE_SECRET_KEY from ignored .env.local for this explicitly authorized administrative recovery; ordinary account operations still use publishable clients.

From an interactive VS Code terminal (not the Output pane), in the project directory:

~~~powershell
node --env-file=.env.local scripts/recover-owner-password.mjs
node --env-file=.env.local scripts/recover-owner-password.mjs --execute
~~~

The first command checks local configuration only: no service connection or password change. The second connects only after confirming the displayed project/account by typing the exact recovery email. It finds that account, asks for a new 12-128-character password twice with all character echo disabled, rechecks the exact verified Auth identity and sends only the password attribute to Supabase's server-side Auth Admin API. Supabase may impose additional strength requirements. Passwords are never passed as arguments, saved to a file/environment variable or printed; they necessarily exist briefly in process memory and are sent over HTTPS to Auth. Ctrl+C/Escape cancels hidden entry. Piped input and arbitrary target/project/password arguments are rejected. Do not run this command in chat, a recording/transcribed console, CI, browser code or Vercel.

This operation does not create/promote/confirm/unban users, change memberships, disable MFA or modify application rows. It refuses missing, ambiguous, unconfirmed or Auth-suspended accounts. Pagination is bounded and no other account identities are displayed. A network failure during the write can leave an uncertain result: try login with the newly entered password before retrying. There is no automatic retry. The tool is a narrow operator recovery, not a replacement for normal email recovery and not proof that SMTP is configured.

After success, log in at https://hospital2hospital.vercel.app with the new password. Email confirmation/recovery SMTP, redirects and templates still need separate verification. Do not paste the password or emailed tokens into chat. No remote recovery was executed by the agent while preparing/testing this tool; tests use mock Auth responses and the default configuration-only command.

## Four-step listing creation and approved catalog submissions (migration 016)

Apply supabase/migrations/20261015001600_listing_wizard_products.sql AFTER 015 and before deploying the wizard code. Use the same trusted SQL Editor/migration process as earlier versions; do not rerun older applied migrations. The script is transactional and should run in full. If PostgREST reports missing RPCs/tables after applying, refresh its schema cache with NOTIFY pgrst, 'reload schema'; then retry. This implementation did not apply hosted migrations or deploy. No new environment variables, buckets or service credentials are required.

The user has successfully tested the existing migration 015 camera/photo/QR workflow live. This new UI reuses that private Storage flow. New tables product_submissions and listing_wizard_drafts have immediate RLS and no ordinary write grants. All writes use guarded, revision-aware RPCs, live confirmed Auth and eligible approved facility ownership/editor roles. Platform administrators review products but have no inventory override.

Create listing now opens Product, Details, Photos and Review cards. Next stays gray until required fields are valid. Back retains input. Cancel exits the first card. Save Draft on later cards saves and returns to My Facility. Incomplete details save separately from stock without guessing quantities/prices; My Facility shows these under Continue a listing setup. They have no listing ID or photos until valid details are prepared. Discard setup removes only unlinked setup drafts. Once linked, the real private draft and its photos are retained, and the Edit link resumes the wizard. Existing listing deletion remains the way to remove linked stock; no automatic draft/photo purge was added. Revision conflicts require reload rather than overwriting a colleague.

Missing products: click Don't see your product? Submit a new product line here! Approved inventory managers submit manufacturer, catalog/SKU, name, category, capital/disposable type and optional description at /products/submit. The request stays pending and does not create stock or enter the product dropdown. A confirmed platform administrator opens My account > Product approval (/admin/products), reviews and approves/rejects with an optional note. Approval resolves normalized manufacturer/catalog identity without overwriting a matching shared reference. Sellers can view their facility's submission statuses and start a listing for an approved product. Trusted existing/imported reference products remain available. Legacy direct create-listing/create-draft calls can no longer introduce unapproved products.

Migration rollback: do not drop the new tables or blindly move the wrapper function back after users create data. Keep a backup and use a versioned corrective migration. Reverting only the UI to the previous release retains catalog approval enforcement; its old propose-new-product flow will correctly refuse unapproved references.

Manual hosted checklist after applying 016:

1. As an approved owner/editor, open Create listing: unselected Next is gray; search/select a real approved product and advance. Cancel from step 1 returns to My Facility.
2. Save incomplete step-2 details; verify an unfinished setup appears with no public stock. Resume, enter quantity, package/unit, USD price (including zero), type and condition; invalid data must keep Next disabled. Verify optional expiry, sterile/use flags, packaging and notes survive Back, Save Draft and reload.
3. Advance to Photos. Take/select a supported image, upload and use the authenticated QR from a second device. Verify six-photo limit, cover/order/removal, retry safety and refresh without loss of details. Save Draft and resume: same listing/photos. Upload/cancel a selected local preview before leaving Photos.
4. Review the latest photos and listing preview, Back to edit details, then return to review and Publish. Verify one public listing with correct USD/package data and the same photos. Repeated submissions must not duplicate stock. Existing search, saves, messages and listing editing must still work.
5. Submit a missing product. Check pending status and absence from the dropdown. As platform administrator, approve it, then refresh/search the dropdown. Reject another request and verify the review note. Submit normalized duplicate identities from two facilities: approval must reuse the canonical product without changing its existing metadata. No stock is created by review.
6. Repeat draft read/write, photo and proposal operations as an unrelated facility, viewer, revoked member and pending/suspended facility. Deny access even via direct RPC/table requests. A platform administrator without eligible inventory membership can review products but cannot edit others' setup drafts/photos.
7. Edit the same draft from two browser tabs: stale saves/publish must fail without overwriting. Suspend/revoke the seller before save, photo refresh/upload or publish: operations must fail closed. Try forged facility/product/privileged JSON fields and legacy direct unapproved-product creation: reject them.

Local validation executes actual migration SQL, RLS, grants, transactions and approval/legacy-bypass checks in PGlite, with mocked external Auth/Storage contracts. Browser presentation checks use fictional local fixtures and mocked catalog/photo endpoints. These do not certify hosted Auth/PostgREST, real signed Storage URLs, email delivery or a physical phone; the checklist above remains required.

Verification record for this change: 122 automated tests passed (including 11 new listing-wizard/product-approval tests), lint passed without warnings, and production build passed. Local Chrome checked all four cards on desktop/mobile viewports, product selection, Next validation, draft labels, photo controls and review with mocked APIs. Temporary preview routes were removed. Hosted wizard/approval/Storage operations were not executed.

## Facilitator Dashboard navigation

Platform administrators can open Facilitator Dashboard from My account or the Find dropdown. /admin opens Facility approvals; the shared tabs also expose Product approvals, Featured listing review and Support tickets. Existing section URLs/bookmarks, filters, pagination and review forms remain valid. A facility owner or facility administrator is not automatically a platform administrator; use the existing secure manual bootstrap process when platform access is intended.

No migration, key or environment changes are required for this navigation update. Ordinary users see neither dashboard link; anonymous direct requests go to login and confirmed non-platform users are denied by the existing server checks/RLS. The live caller-only visibility API uses the ordinary publishable client and never grants permission. Local verification: 126 tests, lint and build passed; browser checks used mocked role responses. After deployment, test a real platform administrator and an unrelated ordinary account: both links appear only for the administrator, all four tabs work, and revoking platform access denies direct URLs and actions as well. No hosted review decisions were made during implementation.

## Users tab and Conner administrator access (October 21)

### Conner's existing account

A read-only Auth check verified conner@babursolutions.com is registered, email-confirmed and not banned. NO administrator grant was executed remotely: the role table is private and this workspace has no trusted direct SQL/Management API connection. Open the existing Supabase project's SQL Editor, paste ALL of supabase/operator/grant-conner-admin.sql, and run it. This transactional/idempotent operator script finds only Conner's existing email, refuses an unconfirmed/banned or missing/ambiguous account, and grants platform access with the explicitly requested audit reason. It does not create/confirm users, assign memberships or change credentials. Conner can then refresh/sign in and open Facilitator Dashboard. This script works independently of migration 017.

### Apply and configure the Users feature

Apply supabase/migrations/20261021001700_user_administration.sql in full AFTER migration 016, before deploying the new application code. This version was implemented/tested locally only; no remote migration or deployment was performed. On missing PostgREST functions after application, use NOTIFY pgrst, 'reload schema';. No new environment variables: existing server-only SUPABASE_SECRET_KEY now also supports isolated platform user administration. Ordinary signup/login/facilities/inventory/messages remain publishable-client operations. Never use a NEXT_PUBLIC secret or pass a user's cookies to the admin client.

Users is the fifth Facilitator Dashboard tab at /admin/users. Directory/search reads return a narrow name/email/status projection through live-admin-only database RPCs. Account actions require a confirmed enabled platform administrator, reason, confirmation, immutable account/email rechecks and an audit request UUID. No role management, passwords, deletion or automatic facility membership is exposed. Self/other platform administrator email/status edits are protected and remain trusted operator work.

Add user manually sends a Supabase Auth invitation; the recipient chooses their own password. Configure Supabase custom SMTP (for example Resend) and its sender/domain first, and check Auth delivery limits. This does not use the separate watchlist/referral email worker. Add these exact redirects to Supabase Auth URL Configuration for your actual site origin: https://hospital2hospital.vercel.app/auth/accept-account and http://localhost:3000/auth/accept-account (use your development port). NEXT_PUBLIC_SITE_URL must match the reachable deployed origin. If using Hospital2Hospital.com as canonical later, update it and add the matching HTTPS redirect.

Default invitation/recovery templates using {{ .ConfirmationURL }} redirect to /auth/accept-account with a session fragment. The page removes credentials from the URL, verifies the returned identity and offers Set password using the existing protected form. Custom invitation templates may point to {{ .SiteURL }}/auth/accept-account?token_hash={{ .TokenHash }}&type=invite. This page also accepts type=recovery token_hash links. Existing user-requested recovery templates/callbacks remain supported. Never log, paste or persist real links/tokens. No normal email confirmation is bypassed by manual invitation. Administrative login-email edits are deliberately immediate Auth Admin updates, without the ordinary confirmation flow; the UI requires verification with the account owner first.

### Disabling, uncertainty and operator reconciliation

Disable commits a private live-access flag BEFORE the Auth ban. Existing JWT requests are blocked by restrictive table/Storage RLS and enabled-account guards in existing application security-definer functions. Ordinary server sessions and login also check the flag. Public anonymous browsing remains possible after logout, as before. Existing signed photo/screenshot links may remain usable for their short expiry (currently 60 seconds); already downloaded data cannot be recalled. This is not a claim that JWTs themselves are revoked. Enabling requires a successful Auth unban before clearing the flag. No facility status, membership, stock, conversations or history is deleted.

Auth API and Postgres cannot form one transaction. Each request records requested/succeeded/failed/uncertain in private.account_admin_audit; the Users tab shows the newest 50 audit entries. Lost/uncertain requests must not be automatically replayed. An unresolved target/invitation blocks another request; duplicate request IDs never repeat external work. Actions are limited to 20/hour per administrator and reset requests to one per target per five minutes.

If an operation is requested/uncertain, a trusted operator must compare its exact request ID, target ID/expected email, Auth account state, and private.account_controls before changing the journal. Never infer that an invitation was delivered from account presence or a reset request response. Check Auth/provider logs for delivery. Keep disabled=true on uncertain disable; clear it only after an intended unban is confirmed. If the outcome is verified, record a corrective operator audit note and reconcile only that exact journal row to succeeded/failed, preserving the original actor/reason/request information. No automated cleanup/retry tool is provided. Do not directly edit auth.users; use supported Auth Admin operations. If you cannot determine whether an email was sent, wait/check provider logs rather than repeatedly starting new requests.

### Manual live checklist after migration and deployment

1. Sign in as two unrelated ordinary users, a facility owner/administrator, and an unconfirmed user: Users/direct directory/actions must deny platform administration. A genuine confirmed platform administrator can search accounts and open the fifth tab. Verify both the account/Find links still follow the platform role, never facility roles or metadata.
2. Invite a controlled new test email. Receive/accept the invitation on a DIFFERENT browser/device, verify identity, set a password and log in. Confirm there is no facility membership or platform role. Test expired/used links and SMTP failures, checking requested/uncertain audit states without duplicate accounts or uncontrolled resends.
3. Change a NON-admin test account's login email only after verifying the address, then log in with the new email. Ensure old email fails for new login and account ID, facility associations, saves and messages remain intact. A stale/forged expected email/target must fail. Platform administrator/self email/status controls must deny even via direct RPCs.
4. Open the same ordinary account in another browser and retain its access token. Disable it: new login/refresh, server pages, direct PostgREST table reads/writes/RPCs and Storage sign/upload requests must be blocked even with that old token. Use a real existing photo to test Storage, not an empty bucket. Enable it and sign in again. Test an Auth-side failure: database disable must remain effective; failed enable must not clear it.
5. Send a reset to the test account's ACTUAL current verified address; forged recipient data must not redirect delivery. Open the email on a second device and set a password. Repeat the same request UUID and double-submit: no repeated email. Rate-limit repeated resets. Do not send test emails to real unrelated users.
6. Revoke/disable the acting administrator and repeat direct actions; fail closed. Attempt ordinary inserts into private controls/audit and direct finish RPCs: deny. Verify the audit records actor, target, reason, time and outcome without passwords, secret keys or link tokens. Keep ownership/admin roles and other facilities unchanged.

Local checks execute actual migration 017, function-body gates, restrictive RLS, service-only grants and transactional audit SQL in PGlite with mocked external Auth/Storage contracts. Auth SDK failures/attribute narrowing/target rechecks are mocked; browser checks use fictional local forms and submit nothing. Hosted SMTP, new real sessions, Auth bans/email changes and real Storage requests remain manual. Official references: https://supabase.com/docs/reference/javascript/auth-admin-updateuserbyid and https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail.

Verification record for Users: 139 automated tests passed, lint passed without warnings, and production build passed. New tests include current-JWT table/RPC/Storage denial after disable, Auth ban/enable failure gates, cross-role denials, direct service-finalization denial, duplicate requests, pending/uncertain journals, limits, Conner operator-script replay, narrow Auth payloads and actual Server Action authorization checks with mock adapters. Browser forms/layout were tested locally without submission. No real invitation/reset/ban/email change was sent.
