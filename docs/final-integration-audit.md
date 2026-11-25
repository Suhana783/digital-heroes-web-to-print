# Final integration audit

Reviewed 25 November 2026. This audit covers client/server source wiring and local migrations. No production database was queried or changed, and the application was not deployed. The project `.env` files were not read.

## Customer journey

| Step | Assessment | Evidence and limitation |
| --- | --- | --- |
| Browse divisions/products and view details | Connected | Public catalogue routes use the catalogue API and render configured products. |
| Configure product and calculate price | Connected | Product details call the server pricing endpoint; order creation recalculates totals from database catalogue data. |
| Use designer and save/reopen design | Connected as a separate saved-design flow | Customers select active templates, edit text/images, save/reopen owned designs, and get printable-area validation on server updates. Product dimensions are administrator-defined coordinate units. |
| Attach saved design to an order | Implemented locally; migration pending | Customers can select an owned saved design for a matching cart product; checkout validates ownership/product server-side and persists the ID on the order item through the atomic order RPC. Order and admin proof views show the association. Migration `20261125000700` is not applied automatically; the feature needs it applied before saved-design orders can be created. |
| Upload artwork | Connected after order placement | Order details allow the owner to upload supported files to an order or item; metadata and downloads are owner-scoped. Artwork is not automatically derived from the saved design. |
| Create order and mock payment | Connected | Checkout reprices cart data, creates an idempotent order, then requests a server-owned payment attempt. Mock results update the payment ledger through an atomic server-side database function and do not move money. |
| View order and payment status | Connected | Owner-scoped account endpoints and order details show order/payment state and allow payment retry. |
| Review/respond to proofs | Connected | Order details retrieve owner-visible proof versions and submit approval/change requests through the existing authenticated workflow. |
| Reorder | Connected with repricing | The order snapshot is converted back to product selections and current server pricing is used. A product that is no longer active/available cannot be reordered. |

## Admin journey and access

- Admin-only product status and template management pages reuse the database-backed admin route guard and server `requireAuth` + `requireAdmin` middleware. Template creation/update uses existing product records.
- The protected order/proof page shows customer artwork and proof versions, accepts new proof versions, and exposes customer responses. Artwork/proof storage remains private and downloads use authorized server routes.
- Production PDFs are generated from the latest approved proof, first saved as `draft_unvalidated`, then PDF-structure validated. Admin download checks that the file is production-ready and still tied to the latest approved proof. Customers have no print-file read policy or download route.
- Admin stage transitions already checked verified payment and latest proof approval. The audit found they did **not** require a validated production file, despite the interface sequence. This was fixed in the Express stage service and production readiness display. A new additive migration makes the database stage RPC enforce the same file gate atomically when it is later applied.
- Admin APIs require the existing database role. Customer order, artwork, saved-design and payment operations filter by the authenticated customer's identity. Static review found no customer route that grants access to another customer's data or production files.

## CSV variable data

CSV upload is authenticated and limited to a 1 MB file, with header/row shape and column mapping validation. The customer must own the saved design; referenced image assets are checked against that design and customer. Generation creates one basic PDF per row, stores objects in a private bucket, records per-row success/failure and batch history, and returns short-lived owner-checked download links. This remains an MVP export: at most 100 rows, synchronous server processing, no durable worker, no production prepress guarantees, and no order/order-item association.

## Payments and security

- Mock mode requires no external payment account or gateway credentials. It does require the existing Supabase backend configuration and payment-attempt migration. Mock mode is rejected when `NODE_ENV=production`.
- The backend loads amount/currency from the owned database order and converts INR to paise. Request validators reject client-supplied amounts; payment attempts and order payment status are atomically updated.
- Razorpay is optional TEST mode only. Checkout signature HMAC is verified server-side, then the provider payment is fetched and checked for matching order, amount, currency and captured status. No live credentials, live payment flow, webhook, settlement or refund processing is enabled.
- Database constraints prevent more than one pending or paid attempt per order. Attempts are reused while pending; a failed attempt may be retried without creating another application order.
- Admin endpoints use `requireAdmin`; private Storage access is brokered through server routes. Service-role and payment secrets remain server-only. This is a static source audit, not a live RLS, Storage, or penetration test.

## Critical fixes made

1. Razorpay Checkout referenced `orderNumber` and `applicationOrderId`, while the payment API returns `orderReference` and `orderId`. The frontend now uses the returned field names for the Checkout description and notes.
2. Production readiness previously meant “approved latest proof + paid,” and stage advancement could proceed without a validated production PDF. Readiness now also requires a `production_ready` file associated with that latest approved proof. The API checks this before calling the stage RPC, the admin queue explains the missing-file blocker, and the new SQL migration adds an atomic database check.

## Verification

- `cd server && npm test` — passed, **51 tests, 0 failures**. This uses Node's built-in test runner; no Jest suite exists. Added checks cover production readiness and saved-design ownership/product/schema readiness.
- `cd server && find src -name '*.js' -print0 | xargs -0 -n1 node --check` — passed.
- `cd client && npm run build` — passed. Vite still reports a non-fatal main JavaScript chunk warning at 507 kB minified (about 148 kB gzip).
- No manual endpoint tests, live payment transactions, browser end-to-end tests, or remote database checks were performed.

## Database and remaining limitations

Created `supabase/migrations/20261125000600_require_validated_files_for_production.sql`. It replaces the existing `admin_update_order_stage` function to require, for every order item entering production, a `production_ready` print file linked to the latest approved proof. It preserves the existing stage/payment/proof rules and service-role-only execute grant. It has **not** been applied; no existing migration was edited and no production database was changed. Until this migration is applied through the owner's reviewed migration workflow, the Express API has the new precheck, but the remote database function does not yet have the added atomic validated-file condition.

The saved-design/order-item association is implemented locally in `supabase/migrations/20261125000700_link_saved_designs_to_order_items.sql`; it has **not** been applied. The backend rejects design-linked checkout until that column and the updated RPC exist, while orders without selected designs retain the prior flow. No database was changed.

Other limitations remain: saved designs link as records but are not automatically converted into order artwork; variable-data batches are not attached to orders; no VAT/tax computation or transactional email is implemented; PDFs do not provide professional prepress (CMYK, bleed, imposition, crop marks, or resolution guarantees); no admin user-management UI exists; and remote migration history was not verified during this audit.

## Files changed

- `client/src/pages/customer/CheckoutPage.jsx`
- `client/src/pages/admin/AdminProofManagement.jsx`
- `server/src/services/adminProductionService.js`
- `server/src/services/adminProductionService.test.js`
- `server/package.json`
- `supabase/migrations/20261125000600_require_validated_files_for_production.sql`
- `supabase/migrations/20261125000700_link_saved_designs_to_order_items.sql`
- `docs/saved-design-order-linking.md`
- `docs/prd-compliance-review.md`
- `docs/final-integration-audit.md`
