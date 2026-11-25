# Final testing and deployment preparation

Reviewed 25 November 2026. No deployment or database mutation was performed. No `.env` contents, access tokens, service-role credentials, payment secrets, or other credential values were read or included here.

## Test and build results

- `cd server && npm test` — **passed**, 51 Node.js built-in tests, 0 failed at the time of this update. The server script is a manually enumerated `node:test` suite, not Jest. It covers pricing/quantity tiers, account and order validators, authentication/admin middleware, artwork/proof validation and selected services, payment request validation, payment mode restrictions, paise conversion, HMAC comparison, production-readiness rules, and saved-design order ownership/product checks.
- `cd server && find src -name '*.js' -print0 | xargs -0 -n1 node --check` — passed for all server JavaScript source and test files.
- `cd client && npm run build` — **passed** using Vite 6.4.6. Vite reports a non-fatal warning: the main JavaScript chunk is 507.00 kB minified (147.86 kB gzip), above its 500 kB warning threshold. The feature pages are otherwise split into lazy-loaded chunks.
- The backend package has no build script; its production entry point is `npm start` (`node src/server.js`). The server was not started because live Supabase dependencies were not configured for an integration run and Part 15 does not require manual endpoint testing.
- No tests failed, so no failing-test repair cycle was needed. No Jest installation/configuration exists. There are no client tests.

The present suite does **not** verify real Supabase queries, payment-attempt database functions, Razorpay network/provider behavior, saved-design or CSV service persistence, production eligibility APIs, admin report APIs, or browser behavior. Do not infer end-to-end correctness from these unit tests and the successful bundle.

## Security and configuration review

- Static client source and generated client bundle contain no service-role, Razorpay secret, or mock-payment secret configuration. Client Supabase uses the publishable/anon key only.
- Root, client, and server ignore rules exclude `.env` files. Existing `client/.env.example` and `server/.env.example` contain placeholders/configuration names, not supplied credentials. Local `.env` files were not read; no credential was copied or displayed.
- Express applies CORS from `CLIENT_URL` (comma-separated origins); the default is the local Vite origin. Set exact deployed origins in the server environment.
- Customer authentication uses Supabase Auth; customer ownership is enforced through authenticated queries/RLS and server checks. Admin APIs use `requireAuth` and database-backed `requireAdmin`.
- Artwork, proof, and generated files use private Storage access through authenticated server operations. Production downloads are admin-only and require current proof eligibility; production entry also requires recorded payment status.
- Payment verification is server-side. The optional Razorpay path requires a `rzp_test_` key ID and HMAC/provider checks. Local mock payment is rejected in `NODE_ENV=production`. No live payment support is claimed.
- Static review does not replace remote RLS/storage verification or end-to-end security tests.

## Supabase migration status

The local repository has 14 ordered migration files: `20261124000100`–`20261124000700` and `20261125000100`–`20261125000700`. The project config points to project ref `wndxghtvnypckkijylrv` and identifies it as production. The user previously reported applying the Part 8 proof migration and the production workflow/approval-gate migrations.

Remote migration history could not be retrieved. `supabase migration list --remote` reached the linked production project but stopped with `AccessTokenRequiredError` because this CLI environment has no Supabase access token. Consequently, this review cannot reliably classify any local migration as pending or applied. The Razorpay metadata, payment-attempt ledger, production-file stage-gate, and saved-design/order-item files (`20261125000400`–`20261125000700`) are especially important to reconcile; do not assume any is applied. There were no database changes.

After an owner signs in to the Supabase CLI (do not paste the token into the repository or chat), run:

```sh
supabase migration list --remote
supabase db push --dry-run
```

Compare local and remote rows and inspect the dry-run plan carefully. If migration history is divergent, stop and reconcile before applying anything. Only after confirming the plan includes exclusively missing intended migrations should an authorized operator run:

```sh
supabase db push
```

Do not run `supabase db reset`, do not drop/recreate production tables, and do not rerun migrations already recorded remotely. If using SQL Editor instead of CLI, first identify each exact missing file and apply it once in timestamp order. The payment docs note that if both payment migrations are missing, `20261125000400_razorpay_payments.sql` precedes `20261125000500_payment_attempts_mock_sandbox.sql`.

## Environment variables

Use the existing placeholder files as a checklist; keep actual values in ignored local files or deployment-provider secret settings.

| App | Variables |
| --- | --- |
| Client | `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` |
| Server | `PORT`, `NODE_ENV`, `CLIENT_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, optional `PRICE_CURRENCY`, `PAYMENT_MODE`, optional `MOCK_PAYMENT_SECRET`, and optional test-only `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` |

Never prefix a server secret with `VITE_`. Local mock mode is for local development only. Razorpay must use test credentials for this assignment; live mode is not implemented. See [payment integration](payment-integration.md) for the payment-mode behavior.

## Local setup

Requirements: Node.js 20+ and npm.

```sh
cd server && npm install
cd ../client && npm install
```

Use the existing `.env.example` files as variable-name checklists and configure local ignored `.env` files without overwriting existing credential files. Supply actual values only through your local environment or deployment-provider secret settings.

Run the API and client in separate terminals:

```sh
cd server && npm run dev
cd client && npm run dev
```

The API defaults to port 5000 and the Vite client normally uses port 5173. For production client output use `cd client && npm run build`; `cd client && npm run preview` previews that output locally. For the API use `cd server && npm start`.

## Supabase and admin setup

1. Configure the Supabase project URL, anon/publishable key, and server-only service-role key in the corresponding local/deployment environment.
2. Review `supabase/migrations/` in timestamp order and reconcile the target project's migration history before applying schema changes. Seed the catalogue only for a fresh database or after checking existing rows; do not duplicate the seed blindly.
3. Ensure private Storage buckets and RLS policies are present for artwork, proofs, and generated files.
4. Register the owner/admin account through the existing Supabase Auth flow. Verify its Auth UUID and follow [the owner-controlled admin promotion procedure](admin-roles.md). Never promote automatically or from a browser request.
5. Confirm the production payment migration history and configuration before using payment or advancing an order into production.

## Deployment preparation

The existing README describes Vercel for `client/` and Render for `server/`, with Supabase for PostgreSQL/Auth/Storage. Provider plan availability and free-tier limits can change; verify current limits in the provider accounts before choosing them. This review did not create deployment configuration, provision services, or deploy.

1. Reconcile all Supabase migrations and verify RLS, bucket privacy, the six seeded divisions, and required tables in the target project.
2. Deploy the client with root `client`, build command `npm run build`, output `dist`, and `VITE_API_URL` pointing to the deployed API `/api` base URL. Configure its publishable Supabase values.
3. Deploy the Express API with root `server`, install/build command `npm install`, start command `npm start`; configure its assigned `PORT`, `NODE_ENV=production`, exact `CLIENT_URL`, and server-side Supabase credentials.
4. Keep mock payment disabled in production. Do not use real Razorpay credentials. If exercising optional Razorpay TEST mode on a deployed environment, use only test credentials and clearly mark the environment as non-live.
5. Verify health, auth redirects, CORS, account ownership, private uploads/downloads, admin role access, payment verification, and checkout in a controlled staging setup before release.
6. Set Auth redirect/site URLs and Vercel SPA fallback for client routes. Recheck secret settings and logs for accidental credential output.

No deployment approval was requested or exercised here, so publishing remains an owner action.

## Deferred requirements and release blockers

- VAT-inclusive pricing/tax rules require correct business rates and calculation requirements.
- Transactional email notifications are not implemented.
- Print and CSV PDFs are MVP drafts, not professional prepress output (no guaranteed dimensions, CMYK, bleed, imposition, crop marks, or resolution validation).
- Variable-data batches are associated with saved designs but not order items; background/durable processing is not implemented.
- Saved-design/order-item linking is implemented locally but requires migration `20261125000700_link_saved_designs_to_order_items.sql`; saved canvas data is not converted into order artwork automatically.
- No live payment, settlement/refund handling, Razorpay webhook reconciliation, or Xero/accounting integration exists.
- Admin user management is owner-controlled rather than a user-management UI.
- Remote migration status and live RLS/Storage state remain unverified until CLI authentication and authorized read-only checks are available.
- Run broader integration/browser/security checks and resolve the migration blocker before deployment. The large-main-chunk warning is non-fatal but is a potential frontend performance follow-up.
