-- Part 8: customer proof review and private generated print-file metadata.
-- Apply after 20261124000500_admin_role_foundation.sql.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('order-proofs', 'order-proofs', false, 20971520, array['application/pdf']),
  ('generated-print-files', 'generated-print-files', false, 20971520, array['application/pdf'])
on conflict (id) do update set
  name = excluded.name,
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create table public.order_proofs (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  version_number integer not null check (version_number > 0),
  proof_file_path text not null unique,
  status text not null default 'sent_to_customer'
    check (status in ('pending_review', 'sent_to_customer', 'changes_requested', 'approved')),
  admin_notes text,
  customer_feedback text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  unique (order_item_id, version_number),
  constraint order_proofs_notes_length check (admin_notes is null or length(admin_notes) <= 4000),
  constraint order_proofs_feedback_length check (customer_feedback is null or length(customer_feedback) <= 4000),
  constraint order_proofs_approval_consistent check (
    (status = 'approved' and approved_at is not null)
    or (status <> 'approved' and approved_at is null)
  )
);

create index order_proofs_item_version_idx
  on public.order_proofs (order_item_id, version_number desc);

create trigger order_proofs_set_updated_at before update on public.order_proofs
for each row execute function public.set_updated_at();

create table public.order_proof_events (
  id uuid primary key default gen_random_uuid(),
  proof_id uuid not null references public.order_proofs(id) on delete restrict,
  event_type text not null check (event_type in ('sent_to_customer', 'changes_requested', 'approved')),
  actor_id uuid not null references auth.users(id) on delete restrict,
  message text,
  created_at timestamptz not null default now(),
  constraint order_proof_events_message_length check (message is null or length(message) <= 4000)
);

create index order_proof_events_proof_created_idx
  on public.order_proof_events (proof_id, created_at);

create table public.print_files (
  id uuid primary key default gen_random_uuid(),
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  source_artwork_id uuid references public.artwork_files(id) on delete set null,
  storage_path text not null unique,
  original_filename text not null,
  file_size bigint not null check (file_size between 1 and 20971520),
  page_width_points numeric(8, 2) not null check (page_width_points > 0),
  page_height_points numeric(8, 2) not null check (page_height_points > 0),
  generation_status text not null default 'draft_unvalidated' check (generation_status = 'draft_unvalidated'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index print_files_item_created_idx on public.print_files (order_item_id, created_at desc);

alter table public.order_proofs enable row level security;
alter table public.order_proof_events enable row level security;
alter table public.print_files enable row level security;

revoke all on public.order_proofs, public.order_proof_events, public.print_files from anon, authenticated;
grant select on public.order_proofs, public.order_proof_events, public.print_files to authenticated;

create policy "Customers can read proofs for their own order items"
on public.order_proofs for select to authenticated
using (exists (
  select 1 from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.id = order_item_id and o.customer_id = (select auth.uid())
));

create policy "Admins can read all proofs"
on public.order_proofs for select to authenticated
using (public.is_admin());

create policy "Customers can read proof events for their own orders"
on public.order_proof_events for select to authenticated
using (exists (
  select 1 from public.order_proofs p
  join public.order_items oi on oi.id = p.order_item_id
  join public.orders o on o.id = oi.order_id
  where p.id = proof_id and o.customer_id = (select auth.uid())
));

create policy "Admins can read all proof events"
on public.order_proof_events for select to authenticated
using (public.is_admin());

create policy "Customers can read print files for their own order items"
on public.print_files for select to authenticated
using (exists (
  select 1 from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where oi.id = order_item_id and o.customer_id = (select auth.uid())
));

create policy "Admins can read all print files"
on public.print_files for select to authenticated
using (public.is_admin());

-- Only the trusted Express service-role client may create a version. A row lock
-- serializes version allocation, and the unique constraint is a second guard.
create function public.create_order_proof_version(
  p_order_item_id uuid,
  p_proof_file_path text,
  p_admin_notes text,
  p_created_by uuid
)
returns public.order_proofs
language plpgsql
security definer
set search_path = ''
as $$
declare
  latest public.order_proofs%rowtype;
  created public.order_proofs%rowtype;
  next_version integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_order_item_id::text, 0));

  if not exists (select 1 from public.order_items where id = p_order_item_id) then
    raise exception using errcode = 'P0002', message = 'Order item not found';
  end if;

  select * into latest from public.order_proofs
  where order_item_id = p_order_item_id
  order by version_number desc limit 1;

  if found and latest.status <> 'changes_requested' then
    raise exception using errcode = '55000', message = 'A new proof version can only follow a change request';
  end if;

  next_version := coalesce(latest.version_number, 0) + 1;
  insert into public.order_proofs (order_item_id, version_number, proof_file_path, status, admin_notes, created_by)
  values (p_order_item_id, next_version, p_proof_file_path, 'sent_to_customer', nullif(btrim(p_admin_notes), ''), p_created_by)
  returning * into created;

  insert into public.order_proof_events (proof_id, event_type, actor_id, message)
  values (created.id, 'sent_to_customer', p_created_by, created.admin_notes);
  return created;
end;
$$;

revoke all on function public.create_order_proof_version(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_order_proof_version(uuid, text, text, uuid) to service_role;

-- Authenticated users may respond only to the latest proof of an item they own.
create function public.respond_to_order_proof(p_proof_id uuid, p_decision text, p_feedback text default null)
returns public.order_proofs
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_proof public.order_proofs%rowtype;
  changed public.order_proofs%rowtype;
  actor uuid := auth.uid();
begin
  if actor is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_decision not in ('approved', 'changes_requested') then
    raise exception using errcode = '22023', message = 'Unsupported proof response';
  end if;
  if p_feedback is not null and length(p_feedback) > 4000 then
    raise exception using errcode = '22023', message = 'Feedback is too long';
  end if;

  select p.* into current_proof
  from public.order_proofs p
  join public.order_items oi on oi.id = p.order_item_id
  join public.orders o on o.id = oi.order_id
  where p.id = p_proof_id and o.customer_id = actor
  for update of p;
  if not found then
    raise exception using errcode = 'P0002', message = 'Proof not found';
  end if;
  if current_proof.status <> 'sent_to_customer' or exists (
    select 1 from public.order_proofs newer
    where newer.order_item_id = current_proof.order_item_id
      and newer.version_number > current_proof.version_number
  ) then
    raise exception using errcode = '55000', message = 'This proof is no longer awaiting a response';
  end if;

  update public.order_proofs set
    status = p_decision,
    customer_feedback = case when p_decision = 'changes_requested' then nullif(btrim(p_feedback), '') else null end,
    approved_at = case when p_decision = 'approved' then now() else null end
  where id = p_proof_id returning * into changed;

  insert into public.order_proof_events (proof_id, event_type, actor_id, message)
  values (p_proof_id, p_decision, actor, case when p_decision = 'changes_requested' then nullif(btrim(p_feedback), '') else null end);
  return changed;
end;
$$;

revoke all on function public.respond_to_order_proof(uuid, text, text) from public, anon;
grant execute on function public.respond_to_order_proof(uuid, text, text) to authenticated;
