# Ryan's feedback: implementation and remaining decisions

## November 23: facility exchange workflow and free shipping handoff

Implemented buyer purchase requests inside existing facility conversations, with requested quantity, list/custom unit price and exact USD total. The user selected partial quantities. Offers are facility-shared; eligible colleagues can review them, while notification read status remains personal. Seller owners/inventory editors accept, deny or counter; buyers accept/decline a seller counter or withdraw an unaccepted request. Decline closes the offer; acceptance allocates stock immediately. Full allocation marks sold; partial allocation leaves only the remaining quantity available. This is an inventory agreement, not payment collection or proof that payment happened.

Every transition creates an immutable structured chat event and ordinary message, so existing inbox/header notifications work without a new paid service or email workflow. Profile/My account and Notifications link to Pending Offers, with purchases/sales/history and actions in the corresponding chat. Exact retries and expected revisions prevent duplicate allocation; competing buyers are serialized on the same listing. Seller shipping is a Create Shipping Label icon/card with fixed external FedEx/UPS links. Sellers create/pay for labels directly on carrier websites, then manually confirm carrier and optional tracking in H2H. H2H receives no card/carrier credentials, buys no labels and makes no carrier API calls. Opening a link is not shipment confirmation.

Migration 025 is required before publication; user reports it applied. There is no in-app cancellation/restoration after acceptance: facilities discuss any failed arrangement and seller inventory managers reconcile stock using existing controls. Buyer address/package details remain in direct coordination and the carrier website. No checkout, payment verification, automated carrier tracking, carrier account integration, buyer receipt confirmation, offer emails, freight or multi-package booking added. The larger integrated Shippo options below remain proposals only.

## November 22: shipping proposal — discussion only, not implemented

Shipping labels after a seller marks stock sold are feasible. Current listings record stock/status, not a completed order, confirmed buyer, shipping address, parcel weight/dimensions or payer. A Sold flag cannot itself create a correctly addressed label or authorize a shipping charge. The action should open a review flow, never purchase automatically.

Planning estimates below are engineering hours, not quotes or calendar delivery promises. They assume a US-domestic, one-parcel pilot and working test accounts. Provider onboarding, commercial approval, postage, subscriptions and API fees are separate.

| Option | Scope | Estimated effort |
| --- | --- | --- |
| Carrier website handoff | A seller-only Create Shipping Label action on sold stock opens a choice of FedEx/UPS websites. Facility signs in and completes the shipment there. No connected accounts, embedded rates, automatic prefill or H2H label storage. | 4–8 hours |
| Multi-carrier provider, recommended integrated route | Use a marketplace/platform product such as Shippo with isolated facility connections, existing carrier accounts, rate selection, explicit label purchase, download/reprint, tracking and cancellation/void handling. Confirm provider support for facility-paid billing and account isolation before choosing it. | 60–90 hours |
| Direct FedEx and UPS | Separate account authorization/onboarding, rate/ship/void/tracking integrations, separate error handling and provider approval/certification where applicable. Highest maintenance burden. | 100–150 hours |

Recommended integrated MVP work:

1. Confirm who pays (seller, recipient or third party), whether a facility can connect both carriers, and choose a provider-supported billing model. Do not put all facilities on a shared H2H billing account by default.
2. Add private facility ship-from/contact information and securely managed facility-specific account connections. Never store carrier passwords or expose tokens in the browser. Live owner/editor eligibility and facility isolation must apply independently on each operation; an administrator account alone must not gain shipping access to a facility.
3. Add a private shipment record tied to the actual listing and selling facility, with manually entered/confirmed buyer contact/address and parcel measurements. Do not infer a buyer from conversations or treat a sold listing as a completed order.
4. Seller sees a Create Shipping Label icon on eligible sold inventory. The flow confirms addresses, weight, dimensions, service/rate, carrier account, payer and cost before purchase. Status becomes View/Print Label after successful creation.
5. Implement stable purchase request IDs, duplicate prevention, uncertain-result reconciliation, printable PDF storage/download, tracking updates, reprint and provider-supported void/cancellation. Retrying a download must never purchase a second label. Keep financial/account activity audited, webhook verification server-side and label/address access private.
6. Test carrier/provider sandboxes, authorization revocation, cross-facility denial, duplicate/retry/timeout cases, void outcomes and a controlled real shipment with the account holder's authorization.

Initial scope excludes freight/pallets/capital-equipment logistics, international/customs, refrigeration, hazardous/restricted goods, pickups, returns and automatic shipment emails. Decide these separately if needed. The deferred registration/contact redesign is not automatically part of this shipping proposal.

Sources checked November 22, 2026: [Shippo for platforms](https://goshippo.com/shippo-for-platforms), [connecting carrier accounts](https://support.goshippo.com/hc/en-us/articles/360024209911-How-to-Connect-Your-Own-Carrier-Account), [UPS OAuth authorization-code integration](https://github.com/UPS-API/api-documentation/blob/main/OAuthAuthCode.yaml), [FedEx integrator onboarding](https://developer.fedex.com/api/en-us/get-started/integrator-provider.html). Estimates are our implementation judgment, not provider promises. No shipping code, provider credentials, purchased labels or account connections have been added.

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
