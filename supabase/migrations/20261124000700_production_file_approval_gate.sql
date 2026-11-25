-- Part 8 follow-up: production files are tied to the currently approved proof.
-- Existing draft_unvalidated rows stay drafts and are not eligible for production.

alter table public.print_files
  add column approved_proof_id uuid references public.order_proofs(id) on delete restrict;

alter table public.print_files
  drop constraint if exists print_files_generation_status_check;

alter table public.print_files
  add constraint print_files_generation_status_check
    check (generation_status in ('draft_unvalidated', 'production_ready', 'superseded')),
  add constraint print_files_approval_state_consistent check (
    (generation_status = 'draft_unvalidated' and approved_proof_id is null)
    or (generation_status in ('production_ready', 'superseded') and approved_proof_id is not null)
  );

create index print_files_approved_proof_idx
  on public.print_files (approved_proof_id) where approved_proof_id is not null;

drop policy if exists "Customers can read print files for their own order items"
  on public.print_files;

-- The existing admin SELECT policy using public.is_admin() remains in place.

create function public.enforce_print_file_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  latest_proof_id uuid;
  latest_proof_status text;
begin
  if new.generation_status <> 'production_ready' then
    return new;
  end if;

  select id, status into latest_proof_id, latest_proof_status
  from public.order_proofs
  where order_item_id = new.order_item_id
  order by version_number desc
  limit 1;

  if latest_proof_id is null or latest_proof_status <> 'approved'
    or new.approved_proof_id is distinct from latest_proof_id then
    raise exception using errcode = '23514', message = 'Production files require the latest approved proof';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_print_file_approval() from public, anon, authenticated;

create trigger print_files_require_latest_approved_proof
before insert or update of order_item_id, approved_proof_id, generation_status
on public.print_files
for each row execute function public.enforce_print_file_approval();

create function public.supersede_ineligible_print_files()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status <> 'approved' then
    update public.print_files
    set generation_status = 'superseded'
    where order_item_id = new.order_item_id
      and generation_status = 'production_ready';
  else
    update public.print_files
    set generation_status = 'superseded'
    where order_item_id = new.order_item_id
      and generation_status = 'production_ready'
      and approved_proof_id is distinct from new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.supersede_ineligible_print_files() from public, anon, authenticated;

create trigger order_proofs_supersede_ineligible_print_files
after insert or update of status on public.order_proofs
for each row execute function public.supersede_ineligible_print_files();
