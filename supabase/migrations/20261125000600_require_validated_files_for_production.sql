-- Require a validated, latest-proof-linked production PDF for every order item
-- before the order can enter Production. This is additive; do not edit prior migrations.

create or replace function public.admin_update_order_stage(p_order_id uuid, p_new_stage text, p_actor_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_order public.orders%rowtype;
  previous text;
begin
  if p_new_stage not in ('quote', 'order', 'artwork', 'proof', 'production', 'completed') then
    raise exception using errcode = '22023', message = 'Invalid production stage';
  end if;

  select * into current_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Order not found';
  end if;
  if current_order.status = 'cancelled' then
    raise exception using errcode = '55000', message = 'Cancelled orders cannot advance';
  end if;
  if p_new_stage = 'production' and current_order.payment_status <> 'paid' then
    raise exception using errcode = '55000', message = 'Payment must be verified before production';
  end if;
  if p_new_stage = 'production' and exists (
    select 1
    from public.order_items oi
    where oi.order_id = p_order_id
      and not exists (
        select 1
        from public.order_proofs p
        where p.order_item_id = oi.id
          and p.status = 'approved'
          and p.version_number = (
            select max(newer.version_number)
            from public.order_proofs newer
            where newer.order_item_id = oi.id
          )
      )
  ) then
    raise exception using errcode = '55000', message = 'Every item must have its latest proof approved before production';
  end if;
  if p_new_stage = 'production' and exists (
    select 1
    from public.order_items oi
    where oi.order_id = p_order_id
      and not exists (
        select 1
        from public.print_files pf
        join public.order_proofs p on p.id = pf.approved_proof_id
        where pf.order_item_id = oi.id
          and pf.generation_status = 'production_ready'
          and p.status = 'approved'
          and p.version_number = (
            select max(newer.version_number)
            from public.order_proofs newer
            where newer.order_item_id = oi.id
          )
      )
  ) then
    raise exception using errcode = '55000', message = 'Every item needs a validated production file for its latest approved proof before production';
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
    status = case
      when p_new_stage = 'completed' then 'completed'
      when p_new_stage = 'production' then 'in_production'
      when p_new_stage in ('order', 'artwork', 'proof') then 'processing'
      else status
    end
  where id = p_order_id returning * into current_order;
  insert into public.order_status_history(order_id, previous_stage, new_stage, actor_id)
    values (p_order_id, previous, p_new_stage, p_actor_id);
  return current_order;
end;
$$;

revoke all on function public.admin_update_order_stage(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_update_order_stage(uuid, text, uuid) to service_role;
