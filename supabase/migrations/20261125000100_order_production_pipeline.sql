-- Production pipeline state, transition history, and private print-file access.

alter table public.orders
  add column production_stage text not null default 'order'
    check (production_stage in ('quote', 'order', 'artwork', 'proof', 'production', 'completed'));

create table public.order_status_history (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  previous_stage text check (previous_stage is null or previous_stage in ('quote', 'order', 'artwork', 'proof', 'production', 'completed')),
  new_stage text not null check (new_stage in ('quote', 'order', 'artwork', 'proof', 'production', 'completed')),
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index order_status_history_order_created_idx on public.order_status_history(order_id, created_at desc);
alter table public.order_status_history enable row level security;
revoke all on public.order_status_history from anon, authenticated;
grant select on public.order_status_history to authenticated;
create policy "Admins can read order status history" on public.order_status_history
  for select to authenticated using (public.is_admin());

create function public.record_initial_order_stage()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.order_status_history(order_id, previous_stage, new_stage, actor_id)
    values (new.id, null, new.production_stage, new.customer_id);
  return new;
end; $$;
revoke all on function public.record_initial_order_stage() from public, anon, authenticated;
create trigger orders_record_initial_stage after insert on public.orders
  for each row execute function public.record_initial_order_stage();

-- The API invokes this with the authenticated admin id; the update and audit row commit together.
create function public.admin_update_order_stage(p_order_id uuid, p_new_stage text, p_actor_id uuid)
returns public.orders language plpgsql security definer set search_path = '' as $$
declare
  current_order public.orders%rowtype;
  previous text;
begin
  if p_new_stage not in ('quote', 'order', 'artwork', 'proof', 'production', 'completed') then
    raise exception using errcode = '22023', message = 'Invalid production stage';
  end if;
  select * into current_order from public.orders where id = p_order_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Order not found'; end if;
  if current_order.status = 'cancelled' then
    raise exception using errcode = '55000', message = 'Cancelled orders cannot advance';
  end if;
  if p_new_stage = 'production' and exists (
    select 1 from public.order_items oi where oi.order_id = p_order_id and not exists (
      select 1 from public.order_proofs p where p.order_item_id = oi.id and p.status = 'approved'
        and p.version_number = (select max(newer.version_number) from public.order_proofs newer where newer.order_item_id = oi.id)
    )
  ) then
    raise exception using errcode = '55000', message = 'Every item must have its latest proof approved before production';
  end if;
  if not (
    (current_order.production_stage = 'quote' and p_new_stage = 'order') or
    (current_order.production_stage = 'order' and p_new_stage = 'artwork') or
    (current_order.production_stage = 'artwork' and p_new_stage = 'proof') or
    (current_order.production_stage = 'proof' and p_new_stage = 'production') or
    (current_order.production_stage = 'production' and p_new_stage = 'completed')
  ) then
    raise exception using errcode = '55000', message = 'Invalid production stage transition';
  end if;
  previous := current_order.production_stage;
  update public.orders set production_stage = p_new_stage,
    status = case when p_new_stage = 'completed' then 'completed' when p_new_stage = 'production' then 'in_production'
      when p_new_stage in ('order', 'artwork', 'proof') then 'processing' else status end
    where id = p_order_id returning * into current_order;
  insert into public.order_status_history(order_id, previous_stage, new_stage, actor_id)
    values (p_order_id, previous, p_new_stage, p_actor_id);
  return current_order;
end; $$;
revoke all on function public.admin_update_order_stage(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_update_order_stage(uuid, text, uuid) to service_role;

-- Keep existing customer proof visibility, but production file metadata is admin API only.
alter table public.print_files drop constraint if exists print_files_approval_state_consistent;
alter table public.print_files add constraint print_files_approval_state_consistent check (
  (generation_status = 'draft_unvalidated')
  or (generation_status in ('production_ready', 'superseded') and approved_proof_id is not null)
);
drop policy if exists "Customers can read print files for their own order items" on public.print_files;
revoke select on public.print_files from authenticated, anon;

  insert into public.order_status_history(order_id, previous_stage, new_stage, actor_id)
    select id, null, production_stage, customer_id from public.orders;
