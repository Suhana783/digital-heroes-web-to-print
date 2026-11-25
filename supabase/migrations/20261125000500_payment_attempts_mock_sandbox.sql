-- Generic payment attempt ledger for the local mock sandbox and optional Razorpay test mode.
-- Orders remain the source of truth for customer payment status and payable amount.

create table public.payment_attempts (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  customer_id uuid not null references auth.users(id) on delete restrict,
  provider text not null check (provider in ('mock', 'razorpay')),
  amount_paise bigint not null check (amount_paise >= 100),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'refunded')),
  gateway_order_id text not null,
  gateway_payment_id text,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payment_attempts_verified_consistent check (
    (status = 'paid' and gateway_payment_id is not null and verified_at is not null)
    or (status <> 'paid' and verified_at is null)
  )
);

-- The earlier Razorpay-only draft tied paid status to its provider-specific columns.
-- Generic attempts are now authoritative for every provider, including the mock sandbox.
alter table public.orders drop constraint if exists orders_payment_verified_consistent;

create index payment_attempts_customer_created_idx
  on public.payment_attempts (customer_id, created_at desc);
create index payment_attempts_order_created_idx
  on public.payment_attempts (order_id, created_at desc);
create unique index payment_attempts_provider_order_unique
  on public.payment_attempts (provider, gateway_order_id);
create unique index payment_attempts_gateway_payment_unique
  on public.payment_attempts (gateway_payment_id)
  where gateway_payment_id is not null;
create unique index payment_attempts_one_paid_per_order
  on public.payment_attempts (order_id)
  where status = 'paid';
create unique index payment_attempts_one_pending_per_order
  on public.payment_attempts (order_id)
  where status = 'pending';

create trigger payment_attempts_set_updated_at before update on public.payment_attempts
for each row execute function public.set_updated_at();

alter table public.payment_attempts enable row level security;
revoke all on public.payment_attempts from anon, authenticated;
grant select on public.payment_attempts to authenticated;
create policy "Customers can read their own payment attempts" on public.payment_attempts
  for select to authenticated using (customer_id = (select auth.uid()));
create policy "Admins can read payment attempts" on public.payment_attempts
  for select to authenticated using (public.is_admin());

-- Keep provider references and payment metadata inaccessible through customer-facing table reads.
revoke select on public.orders from authenticated;
grant select (
  id, customer_id, order_number, status, production_stage, payment_status,
  subtotal, total_amount, currency, delivery_address, contact_snapshot,
  created_at, updated_at
) on public.orders to authenticated;

create function public.create_payment_attempt(
  p_order_id uuid,
  p_customer_id uuid,
  p_provider text,
  p_amount_paise bigint,
  p_currency text,
  p_gateway_order_id text
)
returns public.payment_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.orders%rowtype;
  existing_attempt public.payment_attempts%rowtype;
  created_attempt public.payment_attempts%rowtype;
begin
  select * into target_order from public.orders where id = p_order_id for update;
  if not found or target_order.customer_id <> p_customer_id then
    raise exception using errcode = 'P0002', message = 'Order not found';
  end if;
  if target_order.status in ('cancelled', 'completed') or target_order.production_stage in ('production', 'completed') then
    raise exception using errcode = '55000', message = 'This order is no longer eligible for payment';
  end if;
  if target_order.payment_status = 'paid' or target_order.payment_status = 'refunded' then
    raise exception using errcode = '55000', message = 'This order cannot accept another payment';
  end if;
  if p_provider is null or p_currency is null or p_amount_paise is null or p_gateway_order_id is null
    or p_provider not in ('mock', 'razorpay') or p_currency <> target_order.currency
    or p_amount_paise::numeric <> target_order.total_amount * 100
    or p_amount_paise < 100 or length(p_gateway_order_id) > 100 then
    raise exception using errcode = '22023', message = 'Payment details do not match the order';
  end if;

  select * into existing_attempt from public.payment_attempts
  where order_id = p_order_id and status = 'pending'
  order by created_at desc limit 1;
  if found then
    if existing_attempt.provider <> p_provider then
      raise exception using errcode = '55000', message = 'A payment attempt is already open in another payment mode';
    end if;
    if existing_attempt.amount_paise <> p_amount_paise or existing_attempt.currency <> p_currency then
      raise exception using errcode = '55000', message = 'Pending payment no longer matches the order total';
    end if;
    return existing_attempt;
  end if;

  insert into public.payment_attempts (
    order_id, customer_id, provider, amount_paise, currency, status, gateway_order_id
  ) values (
    p_order_id, p_customer_id, p_provider, p_amount_paise, p_currency, 'pending', p_gateway_order_id
  ) returning * into created_attempt;

  update public.orders set payment_status = 'pending' where id = p_order_id;
  return created_attempt;
end;
$$;

create function public.complete_payment_attempt(
  p_payment_attempt_id uuid,
  p_customer_id uuid,
  p_succeeded boolean,
  p_gateway_payment_id text,
  p_verified_at timestamptz
)
returns public.payment_attempts
language plpgsql
security definer
set search_path = ''
as $$
declare
  attempt public.payment_attempts%rowtype;
  target_order public.orders%rowtype;
  other_paid_attempt public.payment_attempts%rowtype;
begin
  select o.* into target_order
  from public.orders o join public.payment_attempts pa on pa.order_id = o.id
  where pa.id = p_payment_attempt_id and pa.customer_id = p_customer_id
  for update of o;
  if not found then raise exception using errcode = 'P0002', message = 'Payment attempt not found'; end if;

  select * into attempt from public.payment_attempts
  where id = p_payment_attempt_id and customer_id = p_customer_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Payment attempt not found'; end if;
  if target_order.status = 'cancelled' then
    raise exception using errcode = '55000', message = 'Cancelled orders cannot be paid';
  end if;

  if attempt.status = 'paid' then
    if p_succeeded and attempt.gateway_payment_id = p_gateway_payment_id then return attempt; end if;
    if not p_succeeded then return attempt; end if;
    raise exception using errcode = '55000', message = 'This payment attempt was already completed';
  end if;

  select * into other_paid_attempt from public.payment_attempts
  where order_id = attempt.order_id and status = 'paid' limit 1;
  if found then
    if p_succeeded then
      raise exception using errcode = '55000', message = 'This order already has a successful payment';
    end if;
    return other_paid_attempt;
  end if;

  if p_succeeded then
    if p_gateway_payment_id is null or p_gateway_payment_id = '' or p_verified_at is null
      or attempt.amount_paise::numeric <> target_order.total_amount * 100
      or attempt.currency <> target_order.currency then
      raise exception using errcode = '22023', message = 'Verified payment details do not match the order';
    end if;
    update public.payment_attempts set status = 'paid', gateway_payment_id = p_gateway_payment_id,
      verified_at = p_verified_at where id = attempt.id returning * into attempt;
    update public.orders set payment_status = 'paid' where id = target_order.id;
  else
    update public.payment_attempts set status = 'failed', verified_at = null
      where id = attempt.id returning * into attempt;
    update public.orders set payment_status = 'failed'
      where id = target_order.id and payment_status <> 'paid';
  end if;
  return attempt;
end;
$$;

revoke all on function public.create_payment_attempt(uuid, uuid, text, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.create_payment_attempt(uuid, uuid, text, bigint, text, text)
  to service_role;
revoke all on function public.complete_payment_attempt(uuid, uuid, boolean, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.complete_payment_attempt(uuid, uuid, boolean, text, timestamptz)
  to service_role;

-- Payment is a separate gate from proof approval and production status.
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
  if not found then raise exception using errcode = 'P0002', message = 'Order not found'; end if;
  if current_order.status = 'cancelled' then
    raise exception using errcode = '55000', message = 'Cancelled orders cannot advance';
  end if;
  if p_new_stage = 'production' and current_order.payment_status <> 'paid' then
    raise exception using errcode = '55000', message = 'Payment must be verified before production';
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
end;
$$;

revoke all on function public.admin_update_order_stage(uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.admin_update_order_stage(uuid, text, uuid) to service_role;
