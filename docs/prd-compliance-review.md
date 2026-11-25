# PRD compliance review

Reviewed 25 November 2026 against the supplied Digital Heroes assignment PRD and Part 14 integration scope. This is a source and wiring review of the React client, Express API, SQL migrations, RLS/storage usage, and module documentation. It is not a runtime verification, test run, deployment check, or confirmation of remote Supabase migration state.

## Requirement checklist

| PRD area | Status | Findings |
| --- | --- | --- |
| Product divisions and catalogue | Implemented | Public catalogue, division/product detail routes, active product reads, options, quantity tiers, seeded six divisions, and pricing API are represented in client, API, and migration layers. Product photography/examples from real print work are not supplied. |
| Product configuration and pricing | Implemented | Server validates selections against active catalogue records and recalculates prices at order creation. Prices use integer cents. |
| Quantity discounts | Implemented | Quantity tiers are stored and applied by the pricing service. A quantity without a matching tier falls back to the base price. |
| VAT-inclusive pricing | Not implemented | No tax/VAT rate or tax calculation exists. The order total is the calculated product amount. The business's applicable tax rules/rates also need to be supplied before this can be implemented accurately. |
| Customer accounts and authentication | Implemented | Existing Supabase Auth is reused; profile and role records, protected account routes, customer default role, and database-backed admin checks are present. Admin promotion is a documented owner-controlled server/database procedure. |
| Browser designer and artwork uploads | Partially implemented | Customers can edit text and images in template canvases, save/reopen owned designs, and upload supported artwork privately. Backend validates ownership and printable-area bounds. AI originals can be stored but are not browser-editable. The editor is an MVP, not a professional desktop-publishing/prepress tool. |
| CSV merge and variable data | Partially implemented | Authenticated CSV preview, placeholder mapping, batch history, per-row basic PDF generation, private downloads, and customer/design ownership are implemented. Batches link to designs, not orders; scale/background execution and full font fitting are limited. |
| Proof versioning and approval | Implemented | Admin proof creation/versioning and customer approval/change requests use order-item ownership and server/database workflows. Customer responses are stored and the latest proof state drives eligibility. |
| Print-file generation and production access | Partially implemented | PDF draft generation, PDF-structure validation, latest-approved-proof association, and admin-only downloads are enforced. This is not professional prepress: CMYK, bleed, imposition, crop marks, resolution guarantees, and validated production PNG output are absent. |
| Customer dashboard and reorder | Partially implemented | Customers have profile, order history/details, saved designs, variable-data batches, proof actions, and a browser-printable order summary. Reorder is available from order history. There is no dedicated consolidated active-proofs/receipts dashboard, and the receipt is explicitly not a tax invoice or payment receipt. |
| Admin dashboard and production pipeline | Partially implemented | Admins have protected product/template management, order/artwork/proof queue, latest-proof and payment readiness indicators, production stage changes, and archive-like access to completed/cancelled records. There is no separate user-management screen or dedicated production dashboard; user administration is limited to the owner-controlled documented process. |
| Reports and analytics | Partially implemented | Admin reports summarize order activity, totals/status/stages, product/division aggregates, and CSV batches. They are operational summaries, not a financial ledger; CSV batches cannot be attributed to order IDs. |
| Payment integration | Partially implemented | Local mock payment is an explicit simulation and cannot be used in production. Optional Razorpay TEST mode uses server-side order creation, signature and provider checks, and owner scoping. No live payments, webhook reconciliation, settlement/refund processing, or end-to-end verification is claimed. |
| Responsive UI | Partially implemented | Responsive breakpoints and mobile layout rules exist across major pages, including admin reports, designer, checkout, and payment history. No viewport/browser verification was performed in this review. |
| Security and data isolation | Implemented | Existing Supabase Auth, `requireAdmin`, owner-scoped queries, RLS, private Storage, server file checks, production approval/payment gates, and backend payment verification are present in the reviewed source. This is a source-review finding and does not substitute for tests or live policy verification. |
| Documentation and deployment readiness | Partially implemented | Domain setup and workflow docs exist, and this review was added. No deployed URL or deployment verification was available; final Jest suite, runtime verification, and environment-specific setup checks remain before release. |
| Email notifications | Not implemented | No transactional email provider or order/proof/completion notification flow was found. |
| Xero/accounting integration | Deferred | Reports document that no Xero integration or accounting export exists. It is outside the implemented MVP. |

## Workflow integration findings

- **Catalogue → configure → price → cart → order:** Product detail uses the pricing API and cart configuration; order creation recalculates from trusted catalogue data and stores product/configuration snapshots. A cart item can include a saved design for the same product; backend ownership/product checks and order-item persistence are implemented locally. Migration `20261125000700` must be applied before using that association. The browser does not set authoritative order totals.
- **Customer account → artwork/design/CSV:** Customer APIs require the existing Supabase session. Artwork and design access uses customer ownership; private assets are returned through authorized download operations. CSV output is linked to its batch and saved design, but not to an order.
- **Order → proof → approval → production eligibility:** Proofs are versioned per order item. The latest proof approval and payment status are independent production gates. A later change request supersedes production eligibility; production-file access remains admin-only.
- **Order → payment:** Payment requests are authenticated and order-owned. Amount/currency are taken from stored order totals; mock success is server-constructed and recorded atomically, while Razorpay test success requires server verification. The mock does not move money.
- **Admin navigation:** Existing admin product, template, proof/order, reports, and payment APIs/pages are linked from admin navigation. The payment API existed without a page, so this review added a protected payment-history page and route.

## Migrations and live database status

The repository contains 14 ordered migrations: `20261124000100` through `20261124000700`, and `20261125000100` through `20261125000700`. They build the catalogue; customer profiles/orders; checkout; artwork storage; role authorization; proofs/print files; proof approval gate; production pipeline; templates/saved designs; variable-data batches; Razorpay metadata; the mock payment-attempt ledger/payment gate; the validated-file requirement for production stage entry; and saved-design/order-item links.

The user previously reported that the Part 8 proof migration and production workflow/approval-gate migrations were applied to production. Remote history for all migrations was not verifiable during this review: CLI authentication was unavailable. No database changes were made. Do not assume payment migration `20261125000400`/`00500` or the new `20261125000600` is applied; reconcile remote migration history before applying anything. The payment setup doc describes the required order when payment migrations are pending: 00400, then 00500; 00600 follows them.

## Remaining work before final testing and deployment

1. Reconcile local and remote Supabase migration history read-only; apply only migrations confirmed missing using the team's chosen workflow. Never reset or rerun already-applied schema changes.
2. Decide and provide accurate VAT/tax rules and determine whether displayed prices are tax-inclusive; implement only against those agreed rules.
3. Decide whether the assignment requires transactional email and choose/configure a provider before implementing notifications.
4. If professional print output is required, define real product dimensions, bleed, resolution, color, and output-format specifications, then replace/extend the explicitly basic PDF generation accordingly.
5. Decide how variable-data batches should map to order items and production workflow; add that association only if the product flow requires it.
6. Run the complete Jest suite and address failures. This review did not run tests, manual endpoints, or a build.
7. Perform authorized browser/device checks, verify remote RLS/storage and migration state, and deploy only after the final test results and environment configuration are reviewed.

No credentials or `.env` contents were read or included in this report.
