-- Owner-run helper. This does not create users or change signup defaults.
-- Run in the Supabase SQL Editor only after verifying the intended Auth account.

-- Step 1: look up the intended, confirmed account and verify its UUID/email.
select id, email, email_confirmed_at
from auth.users
where lower(email) = lower('verified-admin@example.test')
  and email_confirmed_at is not null;

-- Step 2: replace the UUID placeholder and both email examples with the same
-- verified account, then run this update.
-- A result row means that existing account was promoted. Zero rows means no
-- matching confirmed account/role row was updated.
update public.user_roles as roles
set role = 'admin'
from auth.users as auth_user
where roles.user_id = auth_user.id
  and auth_user.id = 'REPLACE_WITH_VERIFIED_AUTH_UUID'::uuid
  and lower(auth_user.email) = lower('verified-admin@example.test')
  and auth_user.email_confirmed_at is not null
returning auth_user.id, auth_user.email, roles.role, roles.updated_at;
