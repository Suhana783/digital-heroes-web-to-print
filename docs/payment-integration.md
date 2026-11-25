# Payment integration

Part 13 defaults to a local mock sandbox. It does not need a payment-provider account, external payment credentials, KYC, or a network connection to a gateway. Mock payments update application records only and never move money.

## Local mock mode

Set the backend environment in `server/.env`:

```dotenv
PAYMENT_MODE=mock
MOCK_PAYMENT_SECRET=replace_with_a_long_random_local_secret_at_least_32_characters
```

`PAYMENT_MODE` defaults to `mock` when omitted. The mock secret is used only by the server to sign and validate its internal simulation result. If the secret is omitted, the server creates a random process-local secret. Set a long random value for a stable local configuration. It is never returned to the browser and must not use a `VITE_` prefix.

Mock mode does not load Razorpay Checkout JavaScript and is rejected when `NODE_ENV=production`.

Checkout creates a regular application order, then asks Express to create a payment attempt. The Local Payment Sandbox lets the signed-in owner simulate success or failure. Express constructs and validates the mock result on the server, checks the payment attempt belongs to the customer's order, and completes the attempt through an atomic database function. A successful simulation updates the attempt and order payment status together. A failed attempt stays available for another attempt; application orders are not duplicated.

The mock intentionally simulates only payment status, amount matching, references, and verification timestamps. It does not simulate a bank, payment method, settlement, refund transfer, or real transaction.

## API routes

- `POST /api/payments/create-order` — authenticated body `{ "orderId": "<application-order-uuid>" }`; amount and currency come from the database order.
- `POST /api/payments/mock/simulate` — mock mode only; authenticated body includes `orderId`, `paymentOrderId`, and `outcome` (`success` or `failure`).
- `POST /api/payments/verify` — Razorpay mode only; verifies Checkout signature and provider payment status.
- `POST /api/payments/failure` — Razorpay mode only; records a failed or dismissed attempt, never a success.
- `GET /api/payments/:orderId/status` — authenticated, owner-scoped, customer-safe payment summary.
- `GET /api/admin/payments` — existing admin authentication and authorization protect access to payment attempt records.

The service rejects cancelled, completed, production-stage, paid, refunded, or non-INR orders. The payment status is separate from order status and production stage. Advancing an order into production now requires both the latest proof approval and a recorded paid status.

## Optional Razorpay test mode

Razorpay is optional. To enable it, set the following backend-only variables in `server/.env`:

```dotenv
PAYMENT_MODE=razorpay
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_test_key_secret
```

The backend requires a test key ID (`rzp_test_...`) and a secret. Missing or invalid configuration returns a clear server configuration error. Live key IDs are rejected. The frontend receives only the test key ID and provider order details returned for Checkout; the secret stays on the server.

For Razorpay, Express creates the provider order from the stored total, verifies the Checkout HMAC SHA-256 signature using the stored provider order ID, fetches the payment through the official Node SDK, and checks order, amount, currency, and captured status before calling the same atomic completion function used by mock payments. Configure automatic capture in the Razorpay test account; an authorized but uncaptured payment is not marked paid.

Razorpay Checkout JavaScript is loaded only after the backend responds with `mode: "razorpay"`. The official SDK package is `razorpay`. Use the current [Razorpay Standard Checkout integration guide](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/) for test-mode payment methods and their behavior.

## Database migration

`supabase/migrations/20261125000500_payment_attempts_mock_sandbox.sql` adds the payment-attempt ledger, ownership/admin read policies, server-only atomic create/complete functions, and the unpaid production gate. It does not change production data when authored and has not been applied automatically.

Review remote migration history first with `supabase migration list --linked`. If the local and remote histories are reconciled, `supabase db push` applies pending migrations in timestamp order. If using the SQL Editor, run the contents of `20261125000500_payment_attempts_mock_sandbox.sql` once; if the prior local migration `20261125000400_razorpay_payments.sql` is still pending in CLI history, apply it first and then 00500. Do not reset the database or rerun already-applied migrations. Migration 00500 removes the prior Razorpay-only paid-status constraint so mock payments use the generic payment attempt ledger.

## Security and limitations

- Customer payment requests require the existing Supabase Auth middleware and order ownership checks.
- The browser cannot provide the amount, directly set paid status, or create a trusted mock signature.
- Service-role credentials and Razorpay secrets stay on the backend. Customer status APIs omit gateway identifiers; customers can read only their own payment attempts, and admins use the existing `requireAdmin` guard.
- The database updates payment attempt and order status atomically and prevents more than one paid attempt per order.
- There is no webhook or background reconciliation. If a browser closes during Razorpay Checkout before sending its callback, the payment can remain pending until another verification or attempt is made.
- Live payments are not enabled. Live credentials, KYC, a payment account, webhooks/reconciliation, capture policy, refunds, and production payment testing are outside this assignment phase.
