-- Customer identity/profile and future order-history foundation.
-- Supabase Auth remains responsible for passwords and authentication.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_full_name_not_blank check (length(btrim(full_name)) > 0)
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete restrict,
  order_number text not null unique default ('DH-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12))),
  status text not null default 'pending',
  subtotal numeric(12, 2) not null default 0,
  total_amount numeric(12, 2) not null default 0,
  currency text not null default 'INR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint orders_status_valid check (status in ('pending', 'confirmed', 'in_production', 'completed', 'cancelled')),
  constraint orders_subtotal_nonnegative check (subtotal >= 0),
  constraint orders_total_nonnegative check (total_amount >= 0),
  constraint orders_currency_format check (currency ~ '^[A-Z]{3}$')
);

create index orders_customer_created_idx on public.orders (customer_id, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  product_name text not null,
  quantity integer not null,
  unit_price numeric(12, 2) not null,
  line_total numeric(12, 2) not null,
  selected_options jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  constraint order_items_product_name_not_blank check (length(btrim(product_name)) > 0),
  constraint order_items_quantity_positive check (quantity > 0),
  constraint order_items_unit_price_nonnegative check (unit_price >= 0),
  constraint order_items_line_total_nonnegative check (line_total >= 0),
  constraint order_items_selected_options_array check (jsonb_typeof(selected_options) = 'array')
);

create index order_items_order_id_idx on public.order_items (order_id);

create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger orders_set_updated_at before update on public.orders
for each row execute function public.set_updated_at();

create function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table public.profiles enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

create policy "Customers can read their own profile"
on public.profiles for select to authenticated
using (id = (select auth.uid()));

create policy "Customers can update their own profile"
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "Customers can read their own orders"
on public.orders for select to authenticated
using (customer_id = (select auth.uid()));

create policy "Customers can read items from their own orders"
on public.order_items for select to authenticated
using (
  exists (
    select 1 from public.orders own_order
    where own_order.id = order_id and own_order.customer_id = (select auth.uid())
  )
);

revoke all on public.profiles, public.orders, public.order_items from anon, authenticated;
grant select on public.profiles, public.orders, public.order_items to authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
revoke insert, delete, truncate, references, trigger on public.profiles, public.orders, public.order_items from anon, authenticated;
revoke update on public.orders, public.order_items from anon, authenticated;
