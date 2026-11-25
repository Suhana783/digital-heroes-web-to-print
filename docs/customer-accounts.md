# Customer accounts and order foundation

## Authentication flow

Supabase Auth owns password storage, sign-up, sign-in, and browser sessions. The React client uses only the publishable anon key configured as `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Registration sends `full_name` as Auth user metadata. A database trigger creates the corresponding `profiles` record; the application never stores passwords.

The admin-role foundation adds a separate database-owned `user_roles` row. New accounts and existing accounts default to `customer`; role assignment is not part of registration or profile editing. See [admin roles](admin-roles.md) for trusted promotion and admin-route checks.

For protected requests, the client sends the Supabase access token as an Express bearer token. Express calls Supabase Auth `getUser(token)` to verify it, takes the user ID from that verified result, and creates a Supabase client carrying that user's JWT. Profile and order queries therefore run under the customer's RLS identity. APIs do not accept a customer ID from the browser.

## Database migration

Run `supabase/migrations/20261124000200_add_customer_accounts_orders.sql` in the Supabase SQL Editor after the catalogue migration. It creates:

- `profiles`: one row per `auth.users` row, containing name, email, and optional phone. An Auth insert trigger creates each profile. Customers can read their own profile and update only their own name and phone; email is read-only in the profile API.
- `orders`: customer-owned order header with unique human-readable number, status, exact numeric amounts, currency, and timestamps. Browser customers cannot write orders directly.
- `order_items`: product/name/price/quantity snapshots and selected options JSON so old orders remain interpretable if the product changes or is removed. Customers may read items only through their own orders. Browser customers cannot write items directly.

Apply `20261124000300_checkout_order_support.sql` after this migration to add checkout snapshots and the atomic order creation RPC. See [checkout and orders](checkout-orders.md) for the required server configuration and order API.

RLS is enabled for all three tables. An unauthenticated browser cannot read profile or order data. Authenticated policies use `auth.uid()` to scope each row. There are no insert/delete policies for browser users and no unrestricted write policies.

## API

- `GET /api/account/profile`
- `PATCH /api/account/profile` with `{ "full_name": "…", "phone": "…" }` (either field can be updated; phone may be `null`)
- `GET /api/orders`

Every endpoint requires `Authorization: Bearer <Supabase access token>`. Profile updates reject `email`, `id`, and other fields. `GET /api/orders` returns only the authenticated customer's order headers.

## Frontend routes

- `/register` and `/login` use Supabase Auth.
- `/account` is the customer overview.
- `/account/profile` edits name and phone.
- `/account/orders` lists real order headers and has a no-orders empty state. Part 6 adds order details at `/account/orders/:orderId`.

The `AuthProvider` listens for Supabase session changes. Protected routes redirect signed-out visitors to login. An API 401 signs out the stale session so the protected route redirects as well. If email confirmation is enabled in Supabase, registration asks the customer to confirm before signing in.

## Setup and verification

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the ignored `client/.env`. The anon key is publishable; never put a service role/secret key into a `VITE_` variable. Apply the Part 5 and Part 6 migrations in order before testing profile and orders APIs.

Check unauthenticated protection with:

```bash
curl -i http://localhost:5000/api/account/profile
curl -i http://localhost:5000/api/orders
```

Both should return 401. With a customer access token, call the same routes using `-H 'Authorization: Bearer …'`. Do not reuse or paste a real token into source files, documentation, or chat.

After applying the migration, confirm RLS and policies in the SQL Editor:

```sql
select relname, relrowsecurity
from pg_class join pg_namespace on pg_namespace.oid = pg_class.relnamespace
where nspname = 'public' and relname in ('profiles', 'orders', 'order_items')
order by relname;

select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and tablename in ('profiles', 'orders', 'order_items')
order by tablename, policyname;
```

In the UI, register a test customer, confirm email if required, sign in, edit the name/phone, open order history, and log out. An empty order list is expected until a later part implements order placement.
