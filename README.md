# Hospital2Hospital local prototype

A free facility-to-facility surgical supplies and equipment marketplace. Built with the existing Next.js 16, React 19, TypeScript, Tailwind CSS 4, and App Router application.

## Run

```sh
npm install
npm run dev
```

Visit http://localhost:3000. Validation: `npm run lint` and `npm run build`. Production: `npm start` after building.

## Test the workflows

1. On the homepage search `GST60B`. Two fictional facility listings share the same Ethicon Endo-Surgery catalog product. Search `Arthrex`, `FiberStitch`, or `LF1837` to test manufacturer, name, and catalog matches.
2. In Marketplace combine category, manufacturer, and location filters. Change sort order, try an unmatched query, and clear filters. Homepage specialty cards open filtered results.
3. Open a listing. Review stock, condition, expiration, packaging, location, and fictional facility. Click Contact Seller, enter a message, and save the demo inquiry. The confirmation explicitly says nothing was sent. Dashboard inquiry activity shows the record.
4. Bookmark a listing. Visit Saved, reload the page, then remove the bookmark. Saves persist locally.
5. Open Dashboard. Create a listing using an existing catalog product, or choose Add a new demo product. Fill required fields and submit. Your listing belongs to fictional Cedar Grove Surgery Center in Madison, WI. The detail page and Marketplace show the new listing.
6. Edit the new listing from Dashboard. Change quantity, asking price, condition, expiration, or notes. Reload to verify persistence. An existing canonical product's identity and description cannot be overwritten by listing edits. A second listing with the same manufacturer/catalog number reuses its product record.
7. Deactivate the listing in Dashboard. It disappears from Marketplace, remains in Dashboard and Saved (marked inactive), and no longer accepts inquiries. Reactivate it to restore visibility.
8. Check blank required inputs, negative price, fractional quantity, and past expiration validation. Confirm edit routes for another facility show an unavailable message. Check narrow/mobile layouts and keyboard navigation.
9. Dashboard → Demo data controls → Reset demo data restores the original fixtures after confirmation.

## Data and scope

Read both files in `project_sources` before implementation. Their workbook contains product examples only. All seeded quantities, prices, dates, facility names, and stock records are fictional. SVG package/equipment illustrations are placeholders, not product photographs. Demo facilities are unverified. Demo mode has no sign-in; connected mode now supports accounts and manual facility approval as described below. Connected mode provides private in-app messaging. There are no email notifications, attachments, payments, carts, shipping integrations, or fees.

`src/lib/data.ts` holds separate Product, Facility, Listing, and Inquiry types. Product identity is normalized manufacturer + catalog number; multiple facilities can list the same product. `src/lib/repository.ts` contains the replaceable repository interface and localStorage adapter, isolated from UI rendering. Saved listings and inquiries are separate records. Local changes survive refreshes and synchronize across tabs on the same origin. They are not shared between browsers or origins.

Connected mode now uses asynchronous server reads, protected inventory RPCs, live facility membership/RLS, normalized canonical product identity, and private account-owned saves. Demo mode requires no credentials; connected mode uses the URL and publishable key in .env.local. Private listing photos and in-app conversations are implemented in Phase 3. Brand colors live in the root CSS variables in `src/app/globals.css`.

## Connected accounts and inventory

See [SUPABASE_SETUP.md](SUPABASE_SETUP.md) for environment configuration, ordered migrations, email callbacks, manual administrator bootstrap, approval permissions, and the account/recovery test checklist. No project credentials or service-role key are bundled. Accounts require explicit `NEXT_PUBLIC_APP_MODE=connected`; the default demo mode preserves the original prototype.

In connected mode, /account manages facility selection/status, /dashboard manages actual facility-owned stock, and public marketplace pages read active listings from approved facilities. Owners and inventory editors of approved facilities can create/edit/deactivate/reactivate/mark sold. /saved persists privately to the authenticated user. No fictional stock is substituted after failures. Eligible approved facilities can use Contact Seller and /inbox; edit a saved listing to manage photos. Original local demo storage is preserved.

Run `npm test` for authorization tests that execute the actual migrations and RLS in local in-memory PostgreSQL (PGlite), plus application policy tests. No remote database is contacted. Use Node 22.18+ or the tested Node 24 environment.

Catalog import dry run: `npm run catalog:dry-run`. See SUPABASE_SETUP.md for generated SQL, migrations, security rules, and the two-facility manual checklist. No hosted migrations or deployment are performed by these scripts.

## Phase 3 photos and conversations

Apply migrations 005/006 yourself; see SUPABASE_SETUP.md for the private bucket, server-only photo credential, cleanup procedure and two-account live checklist. Photos allow six JPEG/PNG/WebP files up to 5 MB, validated and sanitized on the server, with short-lived RLS-authorized URLs. Conversations persist privately between approved participant facilities; active owners/administrators/editors can read/reply, while viewers and unrelated facilities cannot. Listing history remains accessible after sale. No email notifications are sent. Local automated tests cannot replace live Storage verification.
