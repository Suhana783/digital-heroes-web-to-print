-- Owner-run demo setup. This requires admin@gmail.com to already exist in
-- Supabase Auth, have a confirmed email, and have profile/user_roles rows.
-- Create the Auth user in Supabase Dashboard > Authentication > Users first.
-- This SQL never inserts into auth.users and never changes signup defaults.

do $$
declare
  target_user_id uuid;
  target_email text;
begin
  select id, email
  into target_user_id, target_email
  from auth.users
  where lower(email) = lower('admin@gmail.com')
    and email_confirmed_at is not null;

  if target_user_id is null then
    raise exception 'No confirmed Supabase Auth account found for admin@gmail.com. Create and confirm it through Supabase Auth first.';
  end if;

  update public.profiles
  set full_name = 'admin', email = target_email
  where id = target_user_id;

  if not found then
    raise exception 'The profile row is missing. Verify the customer-account migration and Auth profile trigger.';
  end if;

  update public.user_roles
  set role = 'admin'
  where user_id = target_user_id;

  if not found then
    raise exception 'The user_roles row is missing. Verify the admin-role migration and Auth role trigger.';
  end if;
end;
$$;

select auth_user.id, auth_user.email, auth_user.email_confirmed_at,
       profile.full_name, roles.role
from auth.users as auth_user
join public.profiles as profile on profile.id = auth_user.id
join public.user_roles as roles on roles.user_id = auth_user.id
where lower(auth_user.email) = lower('admin@gmail.com');
