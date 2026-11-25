-- Database-backed authorization roles for customer and future admin APIs.
-- Run after the customer, checkout, and artwork migrations.

create table public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'customer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_roles_role_valid check (role in ('customer', 'admin'))
);

insert into public.user_roles (user_id, role)
select id, 'customer' from auth.users
on conflict (user_id) do nothing;

create trigger user_roles_set_updated_at before update on public.user_roles
for each row execute function public.set_updated_at();

create function public.assign_default_customer_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.user_roles (user_id, role)
  values (new.id, 'customer')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.assign_default_customer_role() from public, anon, authenticated;

create trigger auth_user_assign_customer_role
after insert on auth.users
for each row execute function public.assign_default_customer_role();

create function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = (select auth.uid())
      and role = 'admin'
  );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

alter table public.user_roles enable row level security;
revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;

create policy "Users can read their own role"
on public.user_roles for select to authenticated
using (user_id = (select auth.uid()));

create policy "Admins can read assigned roles"
on public.user_roles for select to authenticated
using (public.is_admin());

create policy "Admins can read all customer profiles"
on public.profiles for select to authenticated
using (public.is_admin());

create policy "Admins can read all customer orders"
on public.orders for select to authenticated
using (public.is_admin());

create policy "Admins can read all order items"
on public.order_items for select to authenticated
using (public.is_admin());

create policy "Admins can read all artwork metadata"
on public.artwork_files for select to authenticated
using (public.is_admin());
