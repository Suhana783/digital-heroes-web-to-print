-- Private customer artwork storage and metadata. Run after Parts 5 and 6.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'customer-artwork',
  'customer-artwork',
  false,
  10485760,
  array['application/pdf', 'image/png', 'image/jpeg', 'image/svg+xml']
)
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.orders
  add constraint orders_id_customer_id_unique unique (id, customer_id);

alter table public.order_items
  add constraint order_items_id_order_id_unique unique (id, order_id);

create table public.artwork_files (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null,
  order_id uuid not null,
  order_item_id uuid,
  original_filename text not null,
  storage_path text not null unique,
  mime_type text not null,
  file_size bigint not null,
  upload_status text not null default 'uploaded',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint artwork_files_order_owner_fk
    foreign key (order_id, customer_id) references public.orders(id, customer_id) on delete restrict,
  constraint artwork_files_order_item_fk
    foreign key (order_item_id, order_id) references public.order_items(id, order_id) on delete restrict,
  constraint artwork_files_filename_not_blank check (length(btrim(original_filename)) > 0),
  constraint artwork_files_mime_type_valid check (mime_type in ('application/pdf', 'image/png', 'image/jpeg', 'image/svg+xml')),
  constraint artwork_files_size_valid check (file_size between 1 and 10485760),
  constraint artwork_files_status_valid check (upload_status in ('uploaded', 'processing', 'failed'))
);

create index artwork_files_customer_order_created_idx
  on public.artwork_files (customer_id, order_id, created_at desc);
create index artwork_files_order_item_idx
  on public.artwork_files (order_item_id) where order_item_id is not null;

create trigger artwork_files_set_updated_at before update on public.artwork_files
for each row execute function public.set_updated_at();

alter table public.artwork_files enable row level security;
revoke all on public.artwork_files from anon, authenticated;
grant select on public.artwork_files to authenticated;

create policy "Customers can read their own artwork metadata"
on public.artwork_files for select to authenticated
using (customer_id = (select auth.uid()));

-- There are intentionally no Storage object policies for browser roles.
-- The private bucket is accessed only by the authenticated Express API using
-- the server-only service role key, after it verifies order ownership.
