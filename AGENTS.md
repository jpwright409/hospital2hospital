<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Hospital2Hospital development

- Stack: Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4. Use the installed Next.js docs linked above before changing routing or rendering.
- Scope: free B2B facility connection marketplace. Homepage, catalog search/filters, listing detail, saved listings, seller dashboard, and create/edit listings. No payments, carts, shipping integrations, or fees.
- Demo facilities and stock are fictional; connected onboarding records are separate account data. Workbook product examples are catalog references, not available inventory. Inquiries are local demo records, never delivered. Connected mode implements confirmed-email accounts and manually approved facilities; demo mode has no authentication. Connected inventory is Supabase-backed; Phase 3 adds private listing photos and facility conversations.
- Canonical products live separately from listings. Normalize manufacturer plus catalog number (trim, collapse whitespace, lowercase in SQL); demo uses productKey. Do not overwrite shared product data when editing a listing.
- Data adapters: src/lib/repository.ts is strictly demo-only with localStorage key hospital2hospital.demo.v1. Connected reads use src/lib/inventory/server.ts; writes use src/app/inventory-actions.ts and guarded SQL RPCs. Server Components provide asynchronous rendering, loading/error boundaries, and URL-based filters. Never render seed stock in connected mode.
- Brand colors are centralized in `src/app/globals.css` root tokens. Illustrations are original inline SVG placeholders. Do not use RevMed branding or assets.
- Commands from this directory: `npm run dev` (local development), `npm run lint`, `npm run build`, `npm start` (production server after build).
- See README.md for workflow checks. Run lint and production build before completing changes. Local demo changes persist only in the same browser and origin; use dashboard demo data controls to reset.

## Supabase account phase

- Follow SUPABASE_SETUP.md. The installed Next.js version is 16.3.8; cookie refresh uses src/proxy.ts and @supabase/ssr. Reinspect the installed version before upgrading conventions.
- Explicit NEXT_PUBLIC_APP_MODE controls demo/connected behavior. Never silently fall back after an account-service failure. Block connected demo inventory writes and inquiries in UI and repository.
- Ordinary clients use only project URL + publishable key. Never introduce a privileged application key for account or facility operations.
- All facility/membership privileged changes go through constrained RPCs, with RLS enabled as tables are introduced. Authorize using live membership/facility rows and verified Auth identity, never signup metadata or selected facility IDs alone.
- Platform administration is separate, private, and manually bootstrapped. Never automatically promote the first user. No existing-facility join or membership-role-management API exists in this phase.
- Migrations live in supabase/migrations. Do not apply remote migrations or deploy without user authorization. npm test executes the actual migrations/RLS in local PGlite with mocked Supabase Auth contracts; it never connects a remote project.
- Run npm test, npm run lint, and npm run build. Document live email/Auth tests separately from locally simulated tests.

## Connected inventory phase

- Migrations 003/004 introduce canonical manufacturers/products, facility listings, user-owned saves, RLS, guarded mutations, safe public projections and search. Only approved active owners (matching facility ownership) and inventory editors may write stock. Facility administrator membership alone is not an inventory editing role.
- No ordinary INSERT/UPDATE/DELETE grants on shared products or inventory. Product resolution and listing creation are transactional RPCs. Listing product/facility identity is immutable; edits use an expected revision to reject stale changes.
- Public facilities expose only id, name, city, state and type through marketplace_facility. Private tables remain protected. Saved records are owned by auth.uid(), independent of selected facility.
- Quantity counts each/box/case/pack; units_per_package describes individual items; price_usd is USD per quantity unit. No totals, purchases or payments.
- npm run catalog:dry-run reads the reference workbook with Node built-ins, deduplicates normalized manufacturer/catalog identity, and never connects a service. Generate operator-only idempotent SQL with node scripts/catalog-import.mjs --output-sql <new-file.sql>. Never infer facility stock or prices from references.
- npm test includes real SQL/RLS authorization tests and import replay in PGlite, not live-project checks. See SUPABASE_SETUP.md for manual Phase 2 verification.

## Photos and conversations (Phase 3)

- Migrations 005/006 add RLS metadata, a private listing-photos bucket, restricted Storage policies, conversations/messages/read cursors and guarded RPCs. Never apply hosted migrations or configure hosted services automatically.
- Photos: six pending/ready slots per listing, 3 MB (3,000,000 bytes) input limit, JPEG/PNG/WebP only. Sharp performs full decode/re-encode to WebP, strips metadata, caps 20 megapixels and stores at most 2400px per side. SVG and animation are rejected.
- Ordinary user Storage uploads require an exact DB reservation owned by an eligible listing facility; they cannot overwrite objects or publish raw bytes. Server-only SUPABASE_SECRET_KEY is used ONLY for validation finalization and narrowly journaled compensation/cleanup, never conversations/account/inventory operations. This key maps to service_role; never expose it or forward user cookies to the admin client.
- Sign private photo reads with the caller publishable-key client and current RLS (including anonymous public inventory). URLs expire after 60 seconds; previous bearer URLs may remain usable until expiry. Do not cache signing results or proxy images through shared caches.
- Cleanup only claims exact pending/deleting photo records. Remove via Storage API, then finish DB cleanup. Never delete bucket contents, unknown paths, ready photos, or Storage metadata directly. Operator script: node --env-file=.env.local scripts/photo-cleanup.mjs (read-only remote inspection); --execute explicitly removes claimed stale records. Do not run either against a hosted project during implementation.
- Conversations: confirmed active owner/administrator/inventory_editor members, both participant facilities approved, no viewer or platform-admin override. Seller derives from the listing; forbid self-facility inquiries. Existing threads retain safe product/status context after stock is sold.
- Messages: plain text 1-4000 chars, immutable participants/authorship, stable client request UUIDs, transactional first message and DB rate limits (20/minute, 200/hour per user; 100/minute, 1000/hour per facility). Inbox has 20 threads/page and history has 30 messages/page. Read cursors are per user, never shared across a facility. Refresh manually; no Realtime, attachments or notifications.
- Local tests model Supabase Auth/Storage contracts while executing real SQL/RLS, decode real images, and mock upload failures. They do not test hosted Storage bytes/signatures/expiry. Follow the separate live checklist in SUPABASE_SETUP.md.

## Shared facility messaging (October 11)

- Migration 007 adds caller-only message facility summaries and a guarded approved messaging facility selector. Inbox/history remain facility-shared; read cursors stay personal. Contact Seller should open an existing facility thread. Conversations are coordination, not inventory reservations or purchases.
- The connected shared header bell polls personal counts across eligible facilities every 30 seconds in visible tabs. API responses are private no-store; use ordinary verified Auth/RLS, never the photo secret. Preserve explicit unavailable/error states. No email notifications or Realtime.
- Switching messaging facility updates the existing account selection; reject stale composers if their rendered facility differs from the live selection. Never permit arbitrary membership joins or viewer messaging through this switcher.

## Saved listing notifications

- Migration 008 adds saved_listing_updates with immediate RLS, transactional listing-update fanout and caller-owned bounded read RPCs. Never insert notifications only in application code; direct guarded inventory RPCs must also trigger them.
- Only public/currently or formerly active approved stock produces events. Inactive/sold transitions expose status alone; private edits and suspended facilities cannot leak quantity/price. Notes are a generic change flag. Historical public snapshots remain account-private; listing links require current public visibility.
- The bell opens /notifications and combines unread message plus saved-update counts. Saves/notification read status are user-owned, independent of facility selection. Removing a save purges its history; no retrospective events. No email, Realtime, photo-change or reference-product alerts.

## Owner feedback additions

- Migrations 009-011 extend types, private backup/opt-in business contacts, negotiable prices, facility-owned procedure and capital/disposable classification, soft deletion, user-private watchlists/referrals and private transactional email outbox. Keep all RLS/grants/live checks intact; new fields never allow shared reference overwrite or membership/ownership changes.
- Ordinary account/watch/referral/inventory operations use publishable clients. Only scripts/email-worker.mjs uses a dedicated SUPABASE_EMAIL_SECRET_KEY. Email defaults disabled; default worker invocation is local config-only, --execute connects/sends and must not run without authorization. No scheduler/provider/remote migration is configured automatically.
- FAQ/About starter copy requires owner review. Contacts default unshared; secondary contacts confer no access. Reactivation remains separate from deletion; preserve conversations/photos on soft delete. Catalog expansion is reviewed reference data only, never competitor stock/assets or invented availability. Read OWNER_FEEDBACK.md and the additional SUPABASE_SETUP.md sections.

## Find and support

- Find follows My Facility (the /dashboard route) in the shared header; hover disclosure must also support keyboard/touch. Get Help is a footer link.
- Migration 012 adds user-private support tickets and support-screenshots Storage policies. Confirmed users can request help regardless of facility approval/membership. Actual account identity comes from Auth; editable contact/facility text never conveys privileges. Platform administrators may review support only, without any expansion of conversation access.
- Text tickets use ordinary publishable clients. Isolated SUPABASE_SUPPORT_SECRET_KEY certifies server-validated screenshots only. Never expose it or forward cookies. App/staff image rendering requires ready certification; retry deletion is confined by RLS to exact pending uploader paths. Use 60-second signed URLs without shared image optimization/cache.
- Default support-cleanup.mjs is local configuration-only; --execute connects/deletes and must not run without authorization. Only expired pending exact journal paths may be removed; ticket text and ready/fresh/other objects stay intact. No support emails or anonymous submissions are enabled.

## Profiles and headshots

- Migration 013 adds own-user profile_avatars and a caller-only transactional profile update RPC. Small sanitized 256px WebP headshots are stored inline (128 KiB max), not in a public bucket. No privileged key is used. Never allow SVG, arbitrary image URLs or identity/role edits through the profile form. Verified Auth email is read-only.
- Account business contact reads use my_active_facility_business_contact with live active membership and caller selection; never widen facility_contacts RLS or expose backup contacts to ordinary members.

## Featured listings and Marketplace landing

- Migration 014 adds RLS-protected boost requests and two featured slots. Approved live inventory managers may request only their own active stock; platform administrators alone review. All writes use guarded RPCs with transactional slot serialization, immutable listing/facility identity and stale revision checks. Never self-approve or add fees/payments.
- Public featured reads use the safe inventory projection with active/nondeleted/approved checks in one SQL snapshot. No private stock or fictional fallback. Connected root shows a standalone welcome/login page to signed-out visitors and redirects confirmed signed-in users to Marketplace; successful login still lands on Marketplace. Demo root still lands on Marketplace. Preserve password recovery and onboarding destinations. Filter popup drafts must not change results until Apply; keep applied URL state and reset pagination.

- Upload file limits and Server Action request limits live in src/lib/upload-limits.mjs: 3,000,000 bytes per file, 4,000,000 bytes per request, leaving headroom below Vercel's 4.5 MB ceiling. Keep all browser inputs (including screenshot retries), server checks and labels consistent. Existing 5 MiB Storage/SQL ceilings remain unchanged; the app is stricter.
