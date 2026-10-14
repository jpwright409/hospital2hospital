# Ryan's feedback: implementation and remaining decisions

Updated October 11, 2026. This audit describes local implementation, not hosted migration or email delivery verification.

| Feedback | Result |
| --- | --- |
| Surgical Hospital, Physician Office, Other | Added to onboarding, database validation and account display alongside Hospital/Surgery Center. |
| Secondary facility contact | Optional during transactional onboarding; owners/administrators can maintain it at `/account/contacts`. Private, with no automatic membership/recovery/ownership privileges. |
| Negotiable price | Added per-listing checkbox, database field, cards/detail/dashboard labels and saved-change notifications. USD asking price remains explicit; 0 can represent no minimum when negotiable. |
| Missing catalog product | Existing controlled transactional proposal workflow retained and improved with manufacturer suggestions/new manufacturer entry, catalog/SKU, description, and capital/disposable classification. Existing shared references are reused without overwrite. |
| Dropdowns | Manufacturer catalog suggestions, category suggestions, inventory type and procedure dropdowns. Listing classifications can be edited without changing canonical products. |
| WestCMR reference analysis | Public navigation reviewed for taxonomy ideas, not imported as facility inventory. See catalog expansion notes below. No full competitor catalog scrape or coverage promise. |
| User-uploaded photos | Already implemented: real seller photos, no stock-image dependency, six images maximum, validated JPEG/PNG/WebP input, private authorized reads. Existing functionality preserved. |
| Filter by facility | Added public seller-facility filter using safe id/name projections for publicly available facilities; distinct from private active-facility selection. |
| Procedure filters | Added ENT, Orthopedics, Plastic Surgery and other procedure options, separate from product categories. Filters/sort/pagination remain in the URL. |
| FAQ/About | `/faq` and `/about` now use the October 13 owner-approved Word documents: 12 FAQ answers and Mission/Opportunity/Vision sections. Starter-copy notices removed. |
| Refer a facility | `/refer`: authenticated eligible approved-facility members queue a personalized plain-text invitation. Retry UUIDs, 10/day per user and one invitation/address/week limit duplicates/abuse. Invitation grants no access; recipient completes ordinary signup and approval. Email requires provider/worker setup. |
| Maintain a watchlist and email on new items | `/watchlist`: create/edit/pause/delete up to 20 account-private watches; combine manufacturer, exact SKU, words, procedure and type. New matching stock is recorded transactionally and optionally queues email to the verified account address. Matches are not reservations. Email requires provider/worker setup. |
| Contact/Buy action | No Buy/cart/checkout. Contact Seller keeps a shared private facility conversation and optionally displays a seller-designated business contact to eligible approved buyers. Personal Auth email and secondary contact are never exposed. Sharing defaults off. |
| Reactivation | Already works for inactive/sold listings. Verify current stock before republishing. |
| Delete a listing | Added separate confirmed soft-deletion: withdraws from marketplace/dashboard and prevents ordinary editing/reactivation while preserving conversations, saves/tombstones, and photo metadata. It does not destroy history or immediately erase stored images. |
| Slogan | Kept current branding pending owner decision. “No cost, no contracts, no waste” is memorable, but the last two phrases are absolute promises. Suggested alternative: “No cost. Less waste. Better connections.” |

## Catalog expansion

Both project reference files were read. The workbook importer still yields 61 unique products and 24 manufacturers, without stock/prices/facilities. Public [WestCMR navigation](https://www.westcmr.com/) shows manufacturer browsing and specialties such as ENT, orthopedics, urology, cardiac/vascular, and OBGYN. These are useful taxonomy references, not proof of 90% SKU coverage. Plastic Surgery is included from Ryan's requested procedure taxonomy and the project reference specification; it is not asserted as a verified top-level WestCMR navigation label.

For an expanded reference catalog, obtain a manufacturer/distributor feed or an owner-approved source, define the desired specialties and scope, and stage records for review. Minimum identity is manufacturer plus catalog number; keep manufacturer aliases explicitly reviewed. Use factual product names and manufacturer descriptions from an appropriate source, record provenance/date, validate catalog numbers, deduplicate normalized identities, and retain conflicts for review. Never reuse competitor design assets/photos or infer facility availability/prices. The existing workbook import is repeatable and creates canonical references only. A bulk competitor-catalog extractor and new feed-specific importer are **not implemented**; feed format, provenance and scope must be established first. Sellers can already add missing references through the app.

## Remaining owner/operator work

1. Apply migrations 009, 010 and 011 in order after 008; restart/rebuild and run the live checklist in SUPABASE_SETUP.md. No remote migrations were run here.
2. Configure the optional email provider/sender and schedule the delivery worker before treating referrals/watchlist emails as live. No real emails were sent or provider accounts configured. Supabase Auth confirmation/recovery delivery is separate.
3. FAQ/About copy supplied October 13 and implemented locally. Support/policy copy and slogan decisions remain. The approved 24-hour review commitment is an operator responsibility; approvals remain manual.
4. Decide whether catalog expansion warrants an additional reviewed import. Specify source and scope; do not assume competitor coverage.
5. Secondary contact information provides continuity information, not a replacement staff account. Staff invitations/role management and ownership succession remain separate future workflows; no unsafe self-join or automatic ownership transfer was introduced.

Fictional demo fixtures remain local-only. The new account/contact/watchlist/email features operate in connected mode; demo pages explain that no real account data or mail is created.

Local verification: **74 tests passed**, lint passed with no warnings, and production build passed. SQL tests execute all eleven migrations with mocked external Auth/Storage contracts; email transport is mocked. These results do not certify hosted RLS/Storage/browser workflows or actual email delivery. No remote migration, provider configuration, delivery-worker execution or deployment occurred.
