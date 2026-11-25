-- Part 11: owner-scoped CSV variable-data batches and generated outputs.
-- Generated PDFs use the existing private generated-print-files bucket.

create table public.variable_data_batches (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  design_id uuid not null,
  original_csv_filename text not null,
  total_rows integer not null check (total_rows between 1 and 100),
  successful_outputs integer not null default 0 check (successful_outputs between 0 and 100),
  failed_rows jsonb not null default '[]'::jsonb check (jsonb_typeof(failed_rows) = 'array'),
  status text not null default 'processing' check (status in ('processing', 'completed', 'partial', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint variable_data_csv_filename_not_blank check (length(btrim(original_csv_filename)) > 0),
  constraint variable_data_batches_id_owner_design_unique unique (id, customer_id, design_id),
  constraint variable_data_batches_design_owner_fk
    foreign key (design_id, customer_id) references public.customer_designs(id, customer_id) on delete cascade
);

create table public.variable_data_outputs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  customer_id uuid not null,
  design_id uuid not null,
  row_number integer not null check (row_number >= 2),
  original_filename text not null,
  storage_path text not null unique,
  file_size bigint not null check (file_size between 1 and 20971520),
  created_at timestamptz not null default now(),
  constraint variable_data_output_filename_not_blank check (length(btrim(original_filename)) > 0),
  constraint variable_data_outputs_batch_row_unique unique (batch_id, row_number),
  constraint variable_data_outputs_batch_owner_design_fk
    foreign key (batch_id, customer_id, design_id)
    references public.variable_data_batches(id, customer_id, design_id) on delete cascade
);

create index variable_data_batches_owner_created_idx
  on public.variable_data_batches (customer_id, created_at desc);
create index variable_data_outputs_batch_row_idx
  on public.variable_data_outputs (batch_id, row_number);

create trigger variable_data_batches_set_updated_at before update on public.variable_data_batches
for each row execute function public.set_updated_at();

alter table public.variable_data_batches enable row level security;
alter table public.variable_data_outputs enable row level security;

revoke all on public.variable_data_batches, public.variable_data_outputs from anon, authenticated;
grant select, insert, update, delete on public.variable_data_batches, public.variable_data_outputs to service_role;

create policy "Customers can read their own variable-data batches"
on public.variable_data_batches for select to authenticated
using (customer_id = (select auth.uid()));

create policy "Customers can read their own variable-data outputs"
on public.variable_data_outputs for select to authenticated
using (customer_id = (select auth.uid()));

-- All table access and object access are performed through authenticated
-- Express routes using the server-only service role. Browser roles have no
-- table grants, so private object paths cannot be read from the Data API.
