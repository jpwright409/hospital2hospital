# Hospital2Hospital context refresh

## October 14 update: welcome account cards

Welcome-page Forgot password, Create account and Resend confirmation links now select their standard auth forms on /?welcome=forgot|register|resend, retaining the white background and full logo. Back-to-login and registration recovery links stay in the welcome flow. Only recognized card values are accepted; invalid values show login. AuthForm is remounted on card changes to reset entered fields and feedback. Existing /auth/* routes keep the normal shell for reauthentication; auth actions/email callbacks are unchanged. Signed-in root redirects strip the welcome-only parameter while preserving inventory queries. This is presentation only; public inventory access/RLS is unchanged. No migration or environment changes.

## October 14 update: signed-out welcome page

Connected root / now checks verified Supabase Auth on the server: signed-out visitors see a standalone white page with Full Main Logo above a welcome/login card; confirmed signed-in users redirect to Marketplace with existing query parameters preserved. Unconfirmed sessions go to the confirmation notice. Auth service failures do not become anonymous/demo fallbacks. /auth/login retains the existing shell for reauthentication but removes the accounts eyebrow above Welcome back. Direct public Marketplace browsing and demo root behavior remain available; this is a landing-page change, not a new access restriction. No migration or environment changes.

## October 14 update: header wordmark and marketplace tagline

Shared page headers now use the owner-supplied public/brand/H2H Words Only Logo.png instead of the compact logo/text combination; the image links to /marketplace. Footer and account fallback retain the compact logo. Marketplace tagline is 14px (13px on mobile), below the main heading size. No migration or environment changes. User authorized checks, GitHub publication and Vercel deployment for this cosmetic update.

## October 14 update: header/footer background separation

Main background is now almost white (35% brand off-white mixed with white), while header/status banner/footer use a slightly darker blue-gray (5% brand navy mixed with off-white). Derived root background/chrome-background tokens keep future palette changes centralized. No migration. On October 14 the user authorized publishing this background adjustment to GitHub and the existing Vercel production project. Verify the deployment status for its result.

## October 14 update: supplied logos and brand palette

Read project_sources/H2H Brand Guidelines.docx and applied its Navy/Teal/Aqua/Seafoam/Pale Aqua/Slate/Off-white palette in centralized CSS tokens, keeping accessible darker text shades and red/amber operational states. Original PNG logos are untouched; compact H2H appears in header/footer/account fallback and the full illustrated main logo on About Us. The supplied favicon replacement was actually PNG named favicon.ico.png; genuine multi-size 256bitH2H.ico is copied to src/app/favicon.ico and supplied PNG to apple-icon.png. See BRANDING.md for asset mapping, contrast and local desktop/mobile visual checks. No migration is needed. On October 14 the user authorized publishing the branding update to GitHub and the existing Vercel production project; verify the deployment status for its result.

## October 13 update: owner-approved About/FAQ and DNS troubleshooting

About/FAQ replace starter copy using src/lib/owner-content.json extracted from the supplied October 13 Word documents. Three About sections and 12 FAQ entries; only the question typo "am I require" corrected to "am I required". Approved copy includes no contracts and approval within 24 hours; this is an operational commitment, not automatic approval or changed permissions. On October 13 the user authorized pushing these content changes to GitHub and deploying through the existing Vercel project. Check GitHub/Vercel status for the actual deployment result. GoDaddy screenshot shows CNAME send -> send.forge.rmta.net and TXT resend._domainkey; syntax appears valid, exact failure unconfirmed. Check record-name conflicts/one-at-a-time save, or use Resend Auto Configure with receiving disabled to retain Google Workspace. Never replace the current Resend-required records with older AWS examples merely because generic guides differ.

## October 11 update: launch accounts and repository

GitHub target: https://github.com/jpwright409/hospital2hospital.git. Vercel account supplied: paul-3870; user will import after code is pushed. Resend account exists under paul@babursolutions.com and key lives only in ignored .env.local. Existing Supabase project is the accepted launch choice. See HOSTING_SETUP.md for DNS/Workspace alias setup and remaining upload/scheduled-email work. No hosted configuration or email sends are implied by the initial GitHub publication.

## October 11 update: watchlist checkbox layout

Create/edit watchlist options appear side by side with each checkbox immediately before its label, Watch for new listings first. The row wraps on narrow screens. Email configuration/disabled behavior is unchanged. No migration needed.

## October 11 update: Watchlists heading and browse button

Watchlists title is 30px and Create a watchlist is 26px. Browse current inventory is a white secondary button, with equal 24px spacing above/below between the explanation and create form. Styles are scoped to Watchlists. No migration or setup is needed.

## October 11 update: control spacing and watchlist shortcut

Marketplace/Saved Show filters uses the light green mint token and both pages have a Watchlist shortcut after Clear filters. Facility inbox switcher uses a narrower select (up to 373px, formerly 560px) with Switch facility beside it; errors/status span the row below. Seller inventory Actions heading is centered. My account header button has slightly less padding/gap. No migrations or additional setup.

## October 11 update: Marketplace landing, filter popup and featured listings

Migration **20261011001400_featured_listings.sql** is new and has not been applied remotely. Root/login/normal confirmation now land on Marketplace; recovery and onboarding destinations remain specialized. Search filters move to a native Show filters popup; Apply persists URL state/reset page, Cancel discards drafts, and Clear filters preserves the search keyword. Demo/Saved use the popup too. Featured Listing has up to two admin-selected actual listings beside the heading; no fictional fallback. My Facility has a lighter Boost a listing button, a facility/active-listing popup, and recent request status. Only approved owners/editors can request; SQL derives facility identity and prevents self-approval/direct writes. /admin/featured (Account home link) has paginated platform-only review and explicit slots 1/2; replacement retires the old placement, stale revisions fail. Public visibility is checked in a single safe-projection query and hides inactive/sold/deleted/suspended stock. No fees/payment/expiry/rotation/email; placements persist until admin removal/replacement and may reappear on reactivation. No new keys/buckets. Read the new SUPABASE_SETUP.md section for migration/manual live checklist.

## October 11 update: shared header styling and navigation

Top status banner, header and footer share the centralized chrome-background color. Navigation order is Marketplace, Saved, Inbox (connected mode), My Facility, Find. My Facility still links to /dashboard. No migrations or setup are needed.

## October 11 update: account menu, profile editor and headshots

Migration **20261011001300_profile_avatars.sql** is new and has not been applied remotely. My account is now a hover/click/keyboard dropdown: Account home, Edit profile, Log out. Native profile modal edits name and optional headshot, keeps verified login email read-only, and has bottom-right Save changes/white Cancel. Save is gray until dirty; cancellation discards changes. Images are server-decoded, sanitized/cropped 256px WebP (5 MiB input, 128 KiB saved) stored inline with own-user RLS in profile_avatars, not in Storage; no new keys/buckets or orphan cleanup. Caller-only transactional RPC cannot edit roles, ownership, memberships or another profile. Account page shows selected facility business contact below user identity through a live-membership projection, never private backup contact. See the new setup section for migration and manual browser/live checks.

## October 11 update: inventory and unread indicators

Seller dashboard table headers use a centralized darker gray token and larger 12px semibold text in both connected and demo modes. The shared notification bell has a red count badge; Facility inbox conversation cards show a red numbered circle at the top-left when unread messages exist. Counts remain personal and existing authorization/read behavior is unchanged. No migrations or additional setup are needed.

## October 11 update: listing deletion confirmation

Dashboard Delete listing is now a compact red button immediately after Mark sold in the actions row, rather than a visible checkbox/form in the table. It opens a native modal dialog asking “Are you sure you wish to delete this listing?”, with “yes, delete the listing”, a red Delete listing button and white Cancel button. Deletion stays disabled until checked. Cancel/Escape dismiss without submitting; cancellation is blocked while a delete is processing. Confirmation/errors reset on reopening, and focus starts on Cancel. The same server confirmation, revision and live facility authorization remain in force. No new migration or setup is needed. Files: `src/components/inventory-forms.tsx` and `src/app/globals.css`.

## October 11 update: Find navigation and Get Help

The shared header now places a Find dropdown immediately after Dashboard: FAQ, About, Refer a facility, Watchlists and Get Help. Mouse hover, touch/click and keyboard disclosure are supported. Get Help is also a footer link. The header wraps navigation at tablet widths.

New migration **20261011001200_support_tickets.sql** (after 011) introduces immediately RLS-protected support tickets, guarded/idempotent submission and platform-only status updates, a private support-screenshots bucket and exact reservation/certification/cleanup RPCs. No hosted migration was applied. `/help` is publicly visitable; confirmed users can submit even with pending/suspended/revoked/no facility membership. Name/email/current facility are prefilled, contact email/facility text remain editable, phone and screenshot optional. True Auth identity/email are separately server-derived. Five tickets/account/day, issue 10-5000 characters, ten tickets/page. Tickets are user-private with platform support administrator access, not facility-shared. `/admin/support` lets platform administrators review/status tickets; no support emails or replies were added.

Screenshots reuse actual JPEG/PNG/WebP Sharp validation (5 MiB, sanitized WebP), ordinary user Storage upload and a dedicated server-only **SUPABASE_SUPPORT_SECRET_KEY** for certification. Text tickets need no secret. App/staff viewing only signs certified ready images for 60 seconds without optimizer/shared caches. Raw pending bytes are restricted to their uploader for safe retry/removal; ordinary callers cannot certify them. Storage failures preserve ticket text and exact pending reservation; unchanged-form or ticket-card retry works within 24 hours. RLS prevents compensation deleting a ready/other file.

Optional **H2H_SUPPORT_EMAIL** is an explicitly public business fallback address for visitors unable to sign in. Anonymous/unconfirmed visitors otherwise see login/recovery/FAQ; anonymous ticket collection is not implemented. See SUPABASE_SETUP.md's newest section for bucket/key setup, expiry/cleanup implications and live checks. `scripts/support-cleanup.mjs` defaults to local configuration-only; **--execute connects/deletes**, so never run it without authorization. Only expired pending exact journal paths are eligible, not ready/fresh images or ticket text.

Key files: `src/components/find-menu.tsx`, `support-form.tsx`, `support-ticket.tsx`, `src/lib/support/`, `src/app/support-actions.ts`, `/help`, `/admin/support`, `tests/support.test.mjs`. Existing auth/inventory/messages/notifications/contact/watchlist flows are preserved. Local tests execute all twelve migrations with mocked external Auth/Storage; hosted upload/signature/browser behavior remains a separate manual checklist.

Latest local verification: **81 tests passed**, lint passed without warnings and production build passed. The support cleanup command's default local-only configuration check was exercised without remote requests/deletion. Tests include same-facility ticket privacy, role/ownership/status forgery, pending/suspended/revoked facility eligibility, limits/idempotency, exact Storage paths, service-only screenshot certification, restrictive-policy resistance, failed-upload compensation, and ready/fresh/stale cleanup protection. No actual hosted uploads/signing/browser hover or touch checks were performed; use the newest live checklist.

## October 11 update: Ryan's owner feedback

Read OWNER_FEEDBACK.md for the complete feature audit and SUPABASE_SETUP.md's newest sections before resuming. New, **not remotely applied here**, migrations are 009_owner_feedback_inventory, 010_facility_contacts and 011_watchlists_referrals_email, in order after 008. No deployment, provider configuration or actual emails were sent.

Implemented: Surgical Hospital/Physician Office/Other types; optional transactional backup contact during onboarding and `/account/contacts` maintenance; private owner/admin contact records and default-off sharing of designated business contact to eligible approved buyers; negotiable asking prices; editable facility-owned procedure and capital/disposable classifications; public facility/procedure/type filters with URL state; guarded confirmed soft deletion, distinct from reversible inactive/sold status; FAQ/About with factual owner-review copy; referral and watchlist pages/forms with private database records, match history and transactional email outbox. Existing new-product resolution, uploaded photos, private shared inbox and saves are preserved. Missing-reference proposals have manufacturer suggestions/new entry, SKU, description and inventory type. Shared products are never overwritten by listing edits.

Deletion withdraws stock from marketplace/dashboard and rejects ordinary edit/reactivation, preserving conversations and private photo metadata/assets. It is not immediate erasure; do not sweep retained images as orphans. Backup contacts confer no membership or succession powers. Seller business sharing is opt-in and separate from personal Auth/backup contact data; private messaging remains available. The user explicitly selected “Keep messaging; optionally show business contact.” Do not replace this with unrestricted public contact disclosure.

Watchlists find future postings, not saved-item changes. Match manufacturer+exact SKU, words, procedure/type; at most 20/account, no retrospective matches or repeated watch/listing emails. They can be edited, paused, removed or email-disabled. Referrals include the authenticated caller's display name/facility and registration link; no automatic membership/approval. UUID idempotency and send limits are enforced in SQL. Watchlist/referral emails use verified destinations and plain text; no message or saved-update email notifications were added.

Email is optional/off until operator setup: H2H_EMAIL_ENABLED, RESEND_API_KEY, H2H_EMAIL_FROM, dedicated server-only SUPABASE_EMAIL_SECRET_KEY plus existing URL/site origin. Ordinary user operations still use the publishable client. The isolated email worker uses service-only claim/receipt RPCs, leases, bounded attempts and stable Resend idempotency keys. Default `node --env-file=.env.local scripts/email-worker.mjs` is local configuration-only; **--execute connects and sends real email**, so never run it without authorization. Configure/schedule it manually; setting keys does not prove delivery. Provider acceptance is not inbox delivery. Review cancellation/retention/retry behavior in the setup guide before operating it.

WestCMR public navigation was reviewed for taxonomy ideas. No competitor assets/stock/prices or full SKU catalog were scraped/imported, and no 90% coverage claim is established. An expanded reviewed feed's source/format/scope is still a decision; existing workbook import and seller proposals already work. Owner-authored FAQ/About/support/policy copy and slogan choice remain outstanding. Suggested slogan is “No cost. Less waste. Better connections.”; existing brand copy was retained.

New implementation map: `src/app/community-actions.ts`, `facility-actions.ts`, `src/components/community-forms.tsx`, `facility-contact-form.tsx`, `/watchlist`, `/refer`, `/about`, `/faq`, `/account/contacts`, `src/lib/email-config.ts`, `scripts/email-delivery.mjs` and `email-worker.mjs`, `tests/owner-feedback.test.mjs`. Connected mode implements these features; fictional demo fixtures remain unchanged/local only. Earlier sections are historical and their “no watchlist/email feature” descriptions are superseded by this update.

Latest local verification: **74 tests passed** against all eleven actual migrations with mocked external Auth/Storage contracts and mocked email transport; lint passed without warnings; production build passed. Default email worker configuration inspection was exercised without service connections or sends. Hosted migrations, actual provider delivery, scheduling and browser workflow checks remain manual. Tests cover onboarding-contact rollback/idempotency, public filter privacy, shared reference protection, delete isolation/history, contact opt-in/backup privacy, watchlist isolation/matching/limits, referral limits, live email eligibility cancellation, claim tokens and bounded retries.

## October 11 update: saved listing notifications

The bell now combines unread facility messages and private saved-listing updates and opens `/notifications`. The page separates both types, provides 20-event pagination and individual/displayed-page Mark as read actions. Reading the page alone does not acknowledge listing alerts. The existing visible-tab 30-second polling remains; there are no emails or Realtime subscriptions.

New migration **20261011000800_saved_listing_notifications.sql**, after 007, introduces an immediately RLS-protected `saved_listing_updates` table, a transactional listing UPDATE trigger, and caller-only count/page/bounded read RPCs. Notifications cover future saved-listing status, quantity/package, price, condition/expiration and details changes; no backfill, photo or canonical catalog alerts. Sold/deactivated transitions notify status only; private/suspended edits never disclose new stock values. Historical public snapshots are private to the saver; current listing links require public availability. Removing a save deletes only that user's related history; resaving watches future changes. Saves remain user-owned regardless of facility membership.

New files: `src/app/notifications/`, `src/app/notification-actions.ts`, `src/components/notification-forms.tsx`, `src/lib/notifications.ts`. `/api/message-notifications` now returns both counts. See SUPABASE_SETUP.md's added migration and live workflow checklist. Neither 007 nor 008 should be assumed applied remotely without user confirmation. **Latest local verification: 59 tests passed against all eight actual migrations, lint passed, and production build passed. No hosted/browser testing, remote migration, or deployment was performed.** The following earlier messaging-only bell description is superseded by this combined notification behavior.

## October 11 update: shared facility messaging and unread bell

Messaging now has an approved-facility dropdown in the inbox and thread view. Eligible active owners/administrators/inventory editors can switch among their memberships; selection changes the account's active facility and returns to that facility's inbox. Other tabs with an old message composer must refresh rather than accidentally send from a newly selected facility.

Facility conversations/history are shared among eligible colleagues, with one thread per listing/buyer facility. Contact Seller links to an existing facility thread rather than presenting another initial inquiry form. This supports coordination but does not reserve inventory or implement purchasing. Read cursors remain personal; reading a thread does not clear another colleague's unread count.

The shared header has a bell beside My account across pages in connected mode. It aggregates personal unread messages across all eligible approved facility inboxes, checks every 30 seconds in visible tabs and on navigation/read/reply events, and signals errors rather than reporting failed checks as zero. Thread messages have New to you indicators. No email notifications or Realtime were added.

New migration: `supabase/migrations/20261011000700_message_notifications.sql`, after 006. It adds caller-only `my_message_facilities()` and guarded `select_message_facility(uuid)` RPCs; no new tables or privileged credentials. Do not assume it has been applied remotely. New UI: `src/components/message-notifications.tsx`; API: `/api/message-notifications` (verified Auth, ordinary client, private no-store). Follow the additional live checklist in SUPABASE_SETUP.md. Local SQL tests now cover all seven migrations and multi-facility shared inbox/unread isolation. **October 11 verification: 53 tests passed, lint passed, and a production build passed with the local environment configuration. No hosted migration or browser/live-project verification was performed.** The October 4 historical record below remains useful, but this update supersedes its messaging UI description and old placeholder-build note for the latest build.

Updated October 4, 2026. This is a handoff for a new chat, not evidence that hosted setup has been completed. Reinspect the repository and follow the user's latest instructions if anything has changed.

## Suggested opening prompt for the next chat

> Read CODEX.md, AGENTS.md, and SUPABASE_SETUP.md before changing anything. Hospital2Hospital Phases 1 and 2 were configured and manually tested against my hosted Supabase development project. Phase 3 (listing photos and private facility conversations) has been implemented and locally validated. Establish which Phase 3 setup and live checks I have completed since this handoff before assuming it works remotely. Preserve authentication, approvals, inventory, saves, and the existing interface. Do not apply remote migrations, configure hosted services, run remote cleanup, or deploy without my authorization. Never expose .env.local secrets. Then address my current request.

## Current status and boundaries

- Hospital2Hospital is a free B2B marketplace for hospitals and surgery centers with excess surgical supplies/equipment. No payments, shopping carts, shipping integrations, or fees.
- The responsive homepage, marketplace search/filter/sort/pagination, listing details, saved listings, seller dashboard, and listing create/edit/status workflows exist.
- **Phases 1 and 2:** the user explicitly reported successful hosted configuration and manual testing before Phase 3 began.
- **Phase 3:** implementation, local tests, lint, and builds are complete. Hosted migrations, bucket configuration, live uploads, signed-link expiry, and live conversation workflows were not performed by the assistant. The user has not yet confirmed those checks. Open IDE tabs and the presence of .env.local are not confirmation.
- No deployment or remote migration was performed. Do not assume the work has been committed or the Git tree is clean; inspect before committing.
- No Realtime, email notifications, message attachments, facility invitation/role-management UI, or ownership-transfer UI exists. A future phase's scope has not been agreed.

## Stack and commands

At this handoff: Next.js **16.3.8** App Router, React **19.2.8**, TypeScript 5, Tailwind CSS 4, ESLint 9, @supabase/ssr ^0.12.7, @supabase/supabase-js ^2.117.2, Sharp ^0.35.5, PGlite ^0.5.8. Recheck package.json and installed versions before changing conventions. AGENTS.md requires reading relevant installed Next docs in `node_modules/next/dist/docs/`; session refresh uses `src/proxy.ts`.

Run from `hospital2hospital` (Windows PowerShell):

```powershell
npm.cmd run dev
npm.cmd test
npm.cmd run lint
npm.cmd run build
npm.cmd start
npm.cmd run catalog:dry-run
```

`npm.cmd` avoids PowerShell npm.ps1 execution-policy issues. Tests use Node's experimental TypeScript stripping; Node 24.21.0 was used, and Node 22.18+ is needed. Run tests, lint, and a production build after implementation changes. No extra checks are necessary merely to read this handoff.

## Mode, configuration, and secrets

`src/lib/app-mode.ts` selects explicit demo or connected behavior. Connected failures must surface actionable errors, never fictional inventory or demo mutations. Demo fixtures and local browser persistence are confined to `src/lib/data.ts` and `src/lib/repository.ts`, using localStorage key `hospital2hospital.demo.v1` in the same browser/origin.

Environment variable names (values belong only in ignored .env.local; see .env.example):

| Variable | Purpose |
| --- | --- |
| NEXT_PUBLIC_APP_MODE | Explicit `demo` or `connected` |
| NEXT_PUBLIC_SUPABASE_URL | Project URL |
| NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY | Ordinary browser/server clients |
| NEXT_PUBLIC_SITE_URL | Auth/email callback origin |
| SUPABASE_SECRET_KEY | Server-only photo certification and narrowly scoped cleanup; not ordinary accounts, inventory, saves, signing, or messaging |

The photo secret maps to service_role; prefer the Supabase secret API key described in the setup guide. Never expose it through NEXT_PUBLIC variables, client imports, logging, or user-session cookies. Read/update environment configuration without revealing actual keys. Missing photo credentials must produce an error; never bypass validation.

The previous verification builds used process-only localhost placeholder public settings, not the live project. Rebuild normally with the actual local configuration before `npm.cmd start`; public environment settings are embedded at build time. No local verification server was left running.

## Implementation map

| Area | Main files/routes |
| --- | --- |
| Development constraints | AGENTS.md; README.md; SUPABASE_SETUP.md |
| Authentication/session | src/lib/supabase/browser.ts, server.ts; src/lib/auth/server.ts, policy.ts; src/proxy.ts; src/app/auth/actions.ts |
| Account/onboarding/approval | Auth pages and callback routes; /account; /onboarding; /admin/facilities |
| Connected inventory | src/lib/inventory/server.ts, types.ts, errors.ts; src/app/inventory-actions.ts; src/components/connected-inventory.tsx, inventory-forms.tsx |
| Shared/demo interface | src/components/marketplace.tsx; original demo repository/data |
| Marketplace routes | /, /marketplace, /saved, /dashboard, /listings/new, /listings/[id], /listings/[id]/edit |
| Photos | src/lib/photos/image.ts, pipeline.ts, server.ts; src/lib/supabase/photo-admin.ts; src/app/photo-actions.ts; src/components/listing-photos.tsx |
| Conversations | src/lib/conversations/types.ts; src/app/conversation-actions.ts; src/components/conversations.tsx, conversation-forms.tsx; /inbox, /inbox/[id] |
| Operator scripts | scripts/catalog-import.mjs; scripts/photo-cleanup.mjs |
| Brand tokens | src/app/globals.css |

Preserve the restrained blue/teal interface and centralized tokens. Do not copy RevMed branding/assets.

## Database and authorization invariants

All tables have RLS. Protected database operations, not client UI checks, enforce permissions. Evaluate verified Auth identity, current membership, current facility status, and actual ownership on every operation; selected facility IDs and signup metadata are not proof of permission.

- **Accounts:** profiles, facilities, facility_memberships. Transactional onboarding creates a pending facility with the caller as owner. Active facility selection is authenticated. Users cannot approve themselves, join arbitrary facilities, change privileged membership fields, or transfer ownership.
- **Platform administration:** separate private, manually bootstrapped administrator records and approval audit. Never auto-promote the first registered user. Platform administrator status is not a participant membership or an inventory editor role.
- **Reference products:** manufacturers and canonical products are separate from facility listings. Unique identity normalizes manufacturer and catalog number by trim, whitespace collapse, and lowercase; punctuation remains significant. Manufacturer aliases are not automatically merged. Sellers resolve/propose products through transactional listing creation, never overwrite shared metadata.
- **Inventory:** immutable facility/product identities; controlled create/edit/status RPCs use revisions to reject stale updates. Quantities use each/box/case/pack plus units_per_package. price_usd is per quantity unit; zero means free. Statuses are active/inactive/sold. Public reads expose active stock at approved facilities and only safe facility id/name/city/state/type.
- **Saves:** saved_listings are private to auth.uid(), independent of selected facility. Unavailable saved entries can be removed without revealing private inventory.

| Caller/context | Inventory/photos | Conversations |
| --- | --- | --- |
| Anonymous | Active approved listings; authorized signed photo reads | None |
| Approved active owner matching actual ownership | Manage own inventory/photos, including inactive/sold photos | Read/reply as a participant |
| Approved active inventory editor | Manage own facility inventory/photos | Read/reply as a participant |
| Approved active facility administrator | No inventory-edit permission solely from this role | Read/reply as a participant |
| Viewer | Public inventory only for photos; no management | No access |
| Pending/rejected/suspended facility or revoked membership | No publishing/modification; photo authorization rechecked live | No access |
| Unrelated platform administrator | Facility approval powers only; no inventory/photo bypass | No access without eligible participant membership |

Phase 2 retains authorized facility stock reads under suspension, but no writes; Phase 3 photo management/viewing and conversations require approval. Both conversation participants must remain approved: suspending either pauses the thread for both sides until eligibility returns.

## Phase 3 details that must not be weakened

**Photos:** private `listing-photos` bucket; at most six pending/ready slots, 5 MiB per input, JPEG/PNG/WebP only. Sharp checks actual content with full decode and re-encode, rejects SVG/animation/damaged data, strips metadata, caps input at 20 megapixels and output at 2400px per side, and stores sanitized WebP.

The database generates unique `<facility>/<listing>/<photo>.webp` paths. Storage insertion requires an exact pending reservation plus live ownership/permissions; a facility prefix alone grants nothing. No object overwrites. Ordinary callers cannot finalize raw uploads. The server certifies validated content with its isolated privileged client, while ordinary caller RLS signs permitted reads for **60 seconds**. Issued bearer links may remain usable until expiry after revocation/deactivation; downloaded bytes cannot be recalled. Photos use unoptimized image rendering to avoid shared optimizer caching. The form accepts one file per upload; next.config.ts allows a 6 MB Server Action body including overhead.

Metadata journals pending/ready/deleting states. Upload/finalization/removal failures preserve recoverable records and never remove unrelated or ready files. Cleanup claims exact stale pending (>1 hour) or deleting rows, deletes through the Storage API, and finishes only after absence is established. **Do not delete Storage metadata directly or sweep guessed prefixes/bucket contents.** `node --env-file=.env.local scripts/photo-cleanup.mjs` is a remote read-only inspection, not a purely local dry run; `--execute` removes claimed files. Neither was run. Obtain explicit hosted-operation authorization before running them.

**Conversations:** confirmed eligible members of an approved buyer facility can contact an active listing at another approved facility. Seller identity derives from the listing, never caller input. Conversation plus first message is transactional, with one thread per listing/buyer facility. Participants and authorship are immutable. Existing eligible threads remain usable after inactive/sold status, with safe product/status context and no private inventory leakage.

Messages render plain text, 1-4000 characters. Stable request UUIDs make successful retries idempotent; the same UUID with a changed payload is rejected. Database-serialized send limits span all threads: 20/minute and 200/hour per user, 100/minute and 1000/hour per facility. Inbox pages contain 20 threads; message history pages contain 30 messages. Read cursors/unread counts are personal, not shared facility state. Latest-page viewing marks displayed history read; older-page viewing does not. Use manual refresh; no Realtime or email notifications.

## Migrations and reference catalog

Apply in order only when the user authorizes hosted setup; SUPABASE_SETUP.md contains exact instructions:

1. `supabase/migrations/20261004000100_account_facilities.sql`
2. `supabase/migrations/20261004000200_platform_approval.sql`
3. `supabase/migrations/20261004000300_inventory.sql`
4. `supabase/migrations/20261004000400_marketplace_queries.sql`
5. `supabase/migrations/20261004000500_listing_photos.sql`
6. `supabase/migrations/20261004000600_facility_conversations.sql`

Phases 1/2 were user-tested remotely. Establish whether 005/006 are now applied before advising another application. Phase 3 bucket settings/policies are introduced by 005; verify private status, MIME restrictions, and size limit against the guide. Do not rewrite already-applied migrations to fix a hosted schema; use a new versioned corrective migration when appropriate.

Read both reference sources before work involving reference requirements/catalog data:

- `project_sources/RevMed_Marketplace_Website_Reference_and_Beta_Spec.docx`
- `project_sources/RevMed_SKU_Category_Brand_Reference_v2.xlsx`

Workbook records are product examples, **never facility stock or prices**. Import dry run found 122 catalog rows, 61 unique products, 24 manufacturers, and 61 duplicates, with no conflicts; the recommendations sheet is excluded. Same catalog numbers at different manufacturers remain distinct. The importer uses built-in Node ZIP/XML processing without network credentials. Generate idempotent catalog-only SQL with `node scripts/catalog-import.mjs --output-sql <new-file.sql>`; it refuses to overwrite an existing file. `reference-catalog.sql` already exists: preserve it and do not infer its application status solely from its presence.

## Verification record and limits

Historical Phase 3 results, not new checks performed when writing this handoff:

- **49 automated tests passed.** The suite executes all six actual migrations in local PGlite with mocked external Supabase Auth and Storage schema/contracts. Actual SQL, RLS, grants, transactions, and rate limits run locally.
- Coverage includes three unrelated facilities, anonymous access, pending/suspended/revoked contexts, viewers, nonparticipant platform administrators, forged paths/participants/authors, ownership-transfer and shared-product protection, private saves, inactive/sold threads, ordering/cover, cleanup, pagination/unread cursors, and duplicate submissions.
- Real Sharp decoding tests cover generated JPEG/PNG/WebP and invalid content; mocked pipeline failures exercise upload/finalization/delete compensation without deleting ready/unrelated assets.
- **Lint passed without warnings. Production builds passed in demo and connected modes.** The last change after those builds was a SQL-only photo-removal locking fix; all 49 tests passed again afterwards.
- Local production HTTP smoke checks against an unavailable localhost Supabase endpoint verified anonymous inbox/thread login redirects and connected marketplace failure without fictional stock.
- **Not verified by these tests:** hosted Storage HTTP/object persistence, actual signed token issuance/expiry or cache behavior, hosted Auth/PostgREST sessions, SMTP delivery, and browser end-to-end Phase 3 workflows. Local contract mocks do not replace those checks.

Tests live under `tests/*.test.mjs`, including authorization, inventory, policy, repository, photos/conversations, and image-upload suites; external Storage scaffolding lives in `tests/helpers/storage.mjs`. SUPABASE_SETUP.md records the detailed distinction between local checks and live checks.

## Resume priorities and remaining manual setup

First establish what the user completed since this document: 005/006 application, private bucket verification, server-only photo key configuration, restart/rebuild, and any live issues. Do not repeat steps or infer failure without evidence.

If still outstanding, follow **SUPABASE_SETUP.md's two-account live Phase 3 checklist**: two confirmed unrelated approved facilities, seller uploads/cover/order/removal, buyer inquiry/replies/unread counts, inactive/sold threads, fresh signing and old-link expiry, invalid/oversized uploads, failure recovery, direct RPC/Storage denials, suspension/revocation/viewer restrictions, and a third unrelated facility/nonparticipant administrator isolation check. Membership-role test changes require a trusted operator; there is no role-management UI. Preserve previously working registration/login/recovery/onboarding/approval/inventory/saves during regression checks.

Email confirmation, local redirect allowlists, administrator bootstrap, and any SMTP/testing setup are documented in SUPABASE_SETUP.md. No new email delivery feature was added in Phase 3. Until live checks are reported, describe Phase 3 as locally validated, not hosted-verified. Ask for the next desired feature or investigate reported issues rather than inventing Phase 4 scope.
