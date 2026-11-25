# Shopping cart and order placement

## Customer flow

Signed-in customers can add a configured product from its product page. The cart is stored in localStorage under that customer's account ID, with product IDs, option selections, custom inputs, and quantities only. Identical configurations combine quantities; different configurations remain separate. The cart and checkout request fresh prices from `POST /api/pricing/calculate`. The order API calculates each item again before saving it.

The checkout page reads the signed-in customer's profile, accepts contact and delivery details, and submits a cart without prices or totals. The API takes the customer ID and email from the verified Supabase access token. It stores contact and delivery snapshots, line item snapshots, and a new order in `pending` / `unpaid` status. The customer then sees the order number and can open the saved order from account history. Payment is not collected or simulated.

## Database setup

Apply migrations in this order in the Supabase SQL Editor:

1. `20261124000200_add_customer_accounts_orders.sql` (Part 5).
2. `20261124000300_checkout_order_support.sql` (Part 6).

The Part 6 migration adds payment and checkout snapshot columns, an idempotency key, and a `SECURITY DEFINER` Postgres function that inserts the order and all its items in one transaction. The function can only be executed by `service_role`; browser roles cannot call it or write order rows. This migration depends on the Part 5 `orders` and `order_items` tables.

## Server configuration

Order creation needs `SUPABASE_SERVICE_ROLE_KEY` in the ignored `server/.env`. Add it directly to that file; never place it in `client/.env`, a `VITE_` variable, source control, or chat. The server uses the anon key for catalogue and price reads, the verified customer's JWT for order history, and the service role only for the atomic order RPC. No `.env.example` file is used.

If the server service key is missing, `POST /api/orders` responds with a safe service-unavailable message and does not place an order. The checkout UI clears the cart only after a successful response.

## API

- `POST /api/orders` accepts an idempotency key, product IDs, selected option IDs, custom inputs, quantities, contact name/phone, and a delivery address. It rejects client prices/totals and unknown fields.
- `GET /api/orders` returns only the signed-in customer's orders.
- `GET /api/orders/:orderId` returns a record only when it belongs to the signed-in customer; other customers receive 404.

The idempotency key is retained in the current browser session for a given customer/cart configuration, so resubmitting after a lost response reuses the same key rather than creating a duplicate order.

## Verification status and local checks

The frontend production build is the local compile check. A live order journey additionally requires the Part 5 and Part 6 migrations to be applied and the server service role key to be configured. Until those prerequisites are present, Supabase order persistence and cross-customer access must not be reported as verified.

With the migrations and server environment configured, verify by signing in, pricing and adding products, adjusting the cart, submitting checkout, and opening the resulting order in history. Also try an unauthenticated order request (401), a second customer's order ID (404), an unavailable product, an invalid option selection, an empty cart, and retrying the same submission. Do not use a real customer's contact details for a test order.
