-- Product catalogue and configurable pricing foundation.
-- Run through the Supabase SQL Editor as the project owner.

create table public.product_divisions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text,
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_divisions_name_not_blank check (length(btrim(name)) > 0),
  constraint product_divisions_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  division_id uuid not null references public.product_divisions(id) on delete restrict,
  name text not null,
  slug text not null,
  description text,
  base_price numeric(12, 2) not null default 0,
  pricing_model text not null default 'base',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_name_not_blank check (length(btrim(name)) > 0),
  constraint products_slug_format check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  constraint products_division_slug_unique unique (division_id, slug),
  constraint products_base_price_nonnegative check (base_price >= 0),
  constraint products_pricing_model_valid check (pricing_model in ('base', 'options', 'quantity_tiers', 'combined'))
);

create table public.product_option_groups (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  name text not null,
  input_type text not null,
  is_required boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_option_groups_name_not_blank check (length(btrim(name)) > 0),
  constraint product_option_groups_input_type_valid check (input_type in ('select', 'multi_select', 'text', 'number', 'color')),
  constraint product_option_groups_product_name_unique unique (product_id, name)
);

create table public.product_option_values (
  id uuid primary key default gen_random_uuid(),
  option_group_id uuid not null references public.product_option_groups(id) on delete cascade,
  label text not null,
  price_adjustment numeric(12, 2) not null default 0,
  adjustment_type text not null default 'fixed',
  is_active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_option_values_label_not_blank check (length(btrim(label)) > 0),
  constraint product_option_values_adjustment_type_valid check (adjustment_type in ('fixed', 'percentage')),
  constraint product_option_values_percentage_valid check (adjustment_type <> 'percentage' or price_adjustment >= -100),
  constraint product_option_values_group_label_unique unique (option_group_id, label)
);

create table public.product_quantity_tiers (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  min_quantity integer not null,
  max_quantity integer,
  unit_price numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_quantity_tiers_min_positive check (min_quantity > 0),
  constraint product_quantity_tiers_max_valid check (max_quantity is null or max_quantity >= min_quantity),
  constraint product_quantity_tiers_unit_price_nonnegative check (unit_price >= 0),
  constraint product_quantity_tiers_product_min_unique unique (product_id, min_quantity)
);

create index products_division_active_idx on public.products (division_id, is_active);
create index product_option_groups_product_sort_idx on public.product_option_groups (product_id, sort_order);
create index product_option_values_group_active_sort_idx on public.product_option_values (option_group_id, is_active, sort_order);
create index product_quantity_tiers_product_min_idx on public.product_quantity_tiers (product_id, min_quantity);

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger product_divisions_set_updated_at before update on public.product_divisions
for each row execute function public.set_updated_at();
create trigger products_set_updated_at before update on public.products
for each row execute function public.set_updated_at();
create trigger product_option_groups_set_updated_at before update on public.product_option_groups
for each row execute function public.set_updated_at();
create trigger product_option_values_set_updated_at before update on public.product_option_values
for each row execute function public.set_updated_at();
create trigger product_quantity_tiers_set_updated_at before update on public.product_quantity_tiers
for each row execute function public.set_updated_at();

alter table public.product_divisions enable row level security;
alter table public.products enable row level security;
alter table public.product_option_groups enable row level security;
alter table public.product_option_values enable row level security;
alter table public.product_quantity_tiers enable row level security;

create policy "Anyone can read active divisions"
on public.product_divisions for select to anon, authenticated
using (is_active);

create policy "Anyone can read active products in active divisions"
on public.products for select to anon, authenticated
using (
  is_active
  and exists (
    select 1 from public.product_divisions division
    where division.id = division_id and division.is_active
  )
);

create policy "Anyone can read option groups for active products"
on public.product_option_groups for select to anon, authenticated
using (
  exists (
    select 1 from public.products product
    join public.product_divisions division on division.id = product.division_id
    where product.id = product_id and product.is_active and division.is_active
  )
);

create policy "Anyone can read active option values for active products"
on public.product_option_values for select to anon, authenticated
using (
  is_active
  and exists (
    select 1 from public.product_option_groups option_group
    join public.products product on product.id = option_group.product_id
    join public.product_divisions division on division.id = product.division_id
    where option_group.id = option_group_id and product.is_active and division.is_active
  )
);

create policy "Anyone can read tiers for active products"
on public.product_quantity_tiers for select to anon, authenticated
using (
  exists (
    select 1 from public.products product
    join public.product_divisions division on division.id = product.division_id
    where product.id = product_id and product.is_active and division.is_active
  )
);

grant usage on schema public to anon, authenticated;
grant select on public.product_divisions, public.products, public.product_option_groups,
  public.product_option_values, public.product_quantity_tiers to anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on public.product_divisions,
  public.products, public.product_option_groups, public.product_option_values,
  public.product_quantity_tiers from anon, authenticated;
