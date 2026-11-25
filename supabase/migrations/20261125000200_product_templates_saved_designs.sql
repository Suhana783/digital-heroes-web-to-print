-- Part 10: reusable product templates, customer designs, and private design assets.
-- Canvas dimensions are administrator-defined coordinate units; no physical
-- product dimensions are inferred or seeded by this migration.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'designer-assets',
  'designer-assets',
  false,
  10485760,
  array['application/pdf', 'application/postscript', 'image/png', 'image/jpeg', 'image/svg+xml']
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.product_templates (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  name text not null,
  canvas_width numeric(10, 2) not null,
  canvas_height numeric(10, 2) not null,
  printable_x numeric(10, 2) not null default 0,
  printable_y numeric(10, 2) not null default 0,
  printable_width numeric(10, 2) not null,
  printable_height numeric(10, 2) not null,
  background_color text not null default '#ffffff',
  allowed_elements jsonb not null default '["text", "image"]'::jsonb,
  placeholder_config jsonb not null default '{"placeholders": []}'::jsonb,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_templates_name_not_blank check (length(btrim(name)) > 0),
  constraint product_templates_name_product_unique unique (product_id, name),
  constraint product_templates_id_product_unique unique (id, product_id),
  constraint product_templates_canvas_positive check (canvas_width > 0 and canvas_height > 0),
  constraint product_templates_printable_area_positive check (printable_width > 0 and printable_height > 0),
  constraint product_templates_printable_area_inside_canvas check (
    printable_x >= 0 and printable_y >= 0
    and printable_x + printable_width <= canvas_width
    and printable_y + printable_height <= canvas_height
  ),
  constraint product_templates_background_color_hex check (background_color ~ '^#[0-9a-fA-F]{6}$'),
  constraint product_templates_allowed_elements_array check (jsonb_typeof(allowed_elements) = 'array'),
  constraint product_templates_placeholders_object check (
    jsonb_typeof(placeholder_config) = 'object'
    and placeholder_config ? 'placeholders'
    and jsonb_typeof(placeholder_config -> 'placeholders') = 'array'
  )
);

create table public.customer_designs (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  template_id uuid not null,
  name text not null default 'Untitled design',
  design_data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_designs_owner_unique unique (id, customer_id),
  constraint customer_designs_template_product_fk
    foreign key (template_id, product_id) references public.product_templates(id, product_id) on delete restrict,
  constraint customer_designs_name_not_blank check (length(btrim(name)) > 0),
  constraint customer_designs_data_shape check (
    jsonb_typeof(design_data) = 'object'
    and jsonb_typeof(design_data -> 'template') = 'object'
    and jsonb_typeof(design_data -> 'elements') = 'array'
  )
);

create table public.design_assets (
  id uuid primary key default gen_random_uuid(),
  design_id uuid not null,
  customer_id uuid not null,
  original_filename text not null,
  storage_path text not null unique,
  mime_type text not null check (mime_type in (
    'application/pdf', 'application/postscript', 'image/png', 'image/jpeg', 'image/svg+xml'
  )),
  file_size bigint not null check (file_size between 1 and 10485760),
  is_previewable boolean not null default false,
  created_at timestamptz not null default now(),
  constraint design_assets_filename_not_blank check (length(btrim(original_filename)) > 0),
  constraint design_assets_design_owner_fk
    foreign key (design_id, customer_id) references public.customer_designs(id, customer_id) on delete cascade
);

create index product_templates_active_product_idx on public.product_templates (product_id, is_active);
create index customer_designs_owner_updated_idx on public.customer_designs (customer_id, updated_at desc);
create index design_assets_owner_design_idx on public.design_assets (customer_id, design_id, created_at);

create trigger product_templates_set_updated_at before update on public.product_templates
for each row execute function public.set_updated_at();
create trigger customer_designs_set_updated_at before update on public.customer_designs
for each row execute function public.set_updated_at();

alter table public.product_templates enable row level security;
alter table public.customer_designs enable row level security;
alter table public.design_assets enable row level security;

revoke all on public.product_templates, public.customer_designs, public.design_assets from anon, authenticated;
grant select on public.product_templates to anon, authenticated;
grant select on public.customer_designs, public.design_assets to authenticated;

create policy "Anyone can read active templates for active products"
on public.product_templates for select to anon, authenticated
using (
  is_active and exists (
    select 1 from public.products p where p.id = product_id and p.is_active
  )
);

create policy "Admins can read all product templates"
on public.product_templates for select to authenticated
using (public.is_admin());

create policy "Customers can read their own saved designs"
on public.customer_designs for select to authenticated
using (customer_id = (select auth.uid()));

create policy "Customers can read metadata for their own design assets"
on public.design_assets for select to authenticated
using (customer_id = (select auth.uid()));

-- All writes and all Storage access run through authenticated Express APIs.
-- Browser roles have no Storage object policies and no table write privileges.
