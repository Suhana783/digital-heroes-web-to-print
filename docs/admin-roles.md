# Admin role foundation

## Role model

Supabase Auth remains the only authentication system. Express verifies every bearer token with Supabase Auth, then uses the verified user ID. The `public.user_roles` table stores one database-owned role per Auth user: `customer` or `admin`.

The Auth insert trigger assigns `customer` to every new account, ignoring all user-supplied metadata. The migration backfills existing Auth accounts as customers. Authenticated clients can read their own role but receive no insert, update, or delete privileges on `user_roles`. A customer therefore cannot promote themselves through registration, profile APIs, user metadata, or direct PostgREST calls.

`public.is_admin()` is a narrowly scoped `SECURITY DEFINER` helper used by RLS policies. It checks the database role, not a browser claim. Admins can read customer profiles, orders, order items, and artwork metadata. Existing customer policies continue to scope customer reads to their own rows. This prerequisite adds no admin write APIs; future admin features should add only the specific writes they need.

## Migration order

Ensure migrations are applied in timestamp order. Apply only migrations that are missing; these SQL migrations are not intended to be rerun. The role migration depends on the Part 5–7 tables:

1. `20261124000200_add_customer_accounts_orders.sql` (Part 5)
2. `20261124000300_checkout_order_support.sql` (Part 6)
3. `20261124000400_customer_artwork_storage.sql` (Part 7)
4. `20261124000500_admin_role_foundation.sql` (this change)

The Part 5 migration already defines `profiles`, `orders`, and `order_items`. Do not create replacement tables. The earlier read-only project check returned 404 for those Part 5 tables, while the current repository contains their migration. That indicates the migration had not been applied to the live database at that check. A fresh live query could not run from this workspace because outbound network access is blocked.

## Promote an existing user

Promotion is a manual, trusted project-owner action in the Supabase Dashboard SQL Editor. No user-facing promotion endpoint exists, and no account is promoted by this migration.

First find the account and verify the email and user identity:

```sql
select id, email
from auth.users
where lower(email) = lower('verified-user@example.com');
```

After verifying the intended account, substitute its exact UUID below and run the update in the SQL Editor:

```sql
update public.user_roles
set role = 'admin'
where user_id = 'REPLACE_WITH_VERIFIED_AUTH_USER_UUID'
returning user_id, role, updated_at;
```

Expect one returned row. If no row is returned, confirm the account exists and that the role migration has been applied. To demote an admin, update the same row to `customer`. Keep this operation in the trusted project-owner SQL Editor; never expose a service-role key or give role-table write privileges to browser clients.

## Admin endpoint

`GET /api/admin/access-check` is the authorization check used by admin navigation and setup verification. It verifies the Supabase access token, then loads the role through the user's RLS-scoped client. It returns 200 only for an `admin`, 403 for a customer, and fails closed if role lookup is unavailable. Part 8 adds proof APIs below `/api/admin/proofs`; those routes inherit the same authentication and role middleware. Their service-role writes remain server-only.

## Verification

After applying the migrations and promoting a test account:

1. Register a new test account. In the SQL Editor, verify its `user_roles` row is `customer`.
2. With that customer's token, call `GET /api/admin/access-check`; expect 403. Calling it without a token should return 401.
3. Try `PATCH /api/account/profile` with an extra `role: "admin"` field; expect 400. A direct authenticated update to `user_roles` should fail for insufficient privileges.
4. Promote the verified test account using the owner SQL above. With that account's token, the same endpoint should return 200 and `role: "admin"`.
5. Confirm a customer still reads only their own profile, orders, order items, and artwork. A different customer's order ID should remain unavailable.
6. With the admin JWT, verify the RLS read policies expose customer profiles, orders, items, and artwork metadata to the admin role.

The local tests exercise the authorization middleware with database-role results. Live RLS and token checks require the migrations and real customer/admin sessions; they must be run in the connected Supabase project before those behaviors are called verified.
