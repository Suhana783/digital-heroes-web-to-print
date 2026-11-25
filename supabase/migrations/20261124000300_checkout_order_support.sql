-- Add checkout snapshots and an atomic, server-only order creation RPC.
-- Run after the Part 5 customer/order migration.

alter table public.orders
  add column payment_status text not null default 'unpaid',
  add column delivery_address jsonb not null default '{}'::jsonb,
  add column contact_snapshot jsonb not null default '{}'::jsonb,
  add column idempotency_key uuid;

alter table public.orders drop constraint if exists orders_status_valid;
alter table public.orders
  add constraint orders_status_valid check (status in ('pending', 'confirmed', 'processing', 'in_production', 'completed', 'cancelled')),
  add constraint orders_payment_status_valid check (payment_status in ('unpaid', 'pending', 'paid', 'failed', 'refunded')),
  add constraint orders_delivery_address_object check (jsonb_typeof(delivery_address) = 'object'),
  add constraint orders_contact_snapshot_object check (jsonb_typeof(contact_snapshot) = 'object');

create unique index orders_customer_idempotency_unique
  on public.orders (customer_id, idempotency_key)
  where idempotency_key is not null;

create function public.create_order_with_items(
  p_customer_id uuid,
  p_idempotency_key uuid,
  p_subtotal numeric,
  p_total_amount numeric,
  p_currency text,
  p_delivery_address jsonb,
  p_contact_snapshot jsonb,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  existing_order public.orders%rowtype;
  created_order public.orders%rowtype;
  created_items jsonb;
  items_total numeric(12, 2);
begin
  if p_customer_id is null or p_idempotency_key is null
    or p_subtotal is null or p_total_amount is null or p_currency is null
    or p_delivery_address is null or p_contact_snapshot is null or p_items is null then
    raise exception 'Invalid order payload';
  end if;
  if jsonb_typeof(p_delivery_address) <> 'object'
    or jsonb_typeof(p_contact_snapshot) <> 'object'
    or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Invalid order payload';
  end if;
  if jsonb_array_length(p_items) = 0 or p_currency !~ '^[A-Z]{3}$' then
    raise exception 'Invalid order payload';
  end if;

  select * into existing_order
  from public.orders
  where customer_id = p_customer_id and idempotency_key = p_idempotency_key;

  if found then
    select coalesce(jsonb_agg(to_jsonb(item) order by item.created_at, item.id), '[]'::jsonb)
    into created_items from public.order_items item where item.order_id = existing_order.id;
    return jsonb_build_object('order', to_jsonb(existing_order), 'items', created_items, 'replayed', true);
  end if;

  select coalesce(sum((line.value ->> 'line_total')::numeric), 0)::numeric(12, 2)
  into items_total from jsonb_array_elements(p_items) as line(value);
  if items_total <> p_subtotal or p_total_amount <> p_subtotal then
    raise exception 'Order totals do not match order items';
  end if;

  insert into public.orders (
    customer_id, idempotency_key, status, payment_status, subtotal, total_amount,
    currency, delivery_address, contact_snapshot
  ) values (
    p_customer_id, p_idempotency_key, 'pending', 'unpaid', p_subtotal, p_total_amount,
    p_currency, p_delivery_address, p_contact_snapshot
  ) on conflict (customer_id, idempotency_key) where idempotency_key is not null
    do nothing returning * into created_order;

  if not found then
    select * into existing_order
    from public.orders
    where customer_id = p_customer_id and idempotency_key = p_idempotency_key;
    select coalesce(jsonb_agg(to_jsonb(item) order by item.created_at, item.id), '[]'::jsonb)
    into created_items from public.order_items item where item.order_id = existing_order.id;
    return jsonb_build_object('order', to_jsonb(existing_order), 'items', created_items, 'replayed', true);
  end if;

  insert into public.order_items (
    order_id, product_id, product_name, quantity, unit_price, line_total, selected_options
  )
  select
    created_order.id,
    nullif(line.value ->> 'product_id', '')::uuid,
    line.value ->> 'product_name',
    (line.value ->> 'quantity')::integer,
    (line.value ->> 'unit_price')::numeric(12, 2),
    (line.value ->> 'line_total')::numeric(12, 2),
    coalesce(line.value -> 'selected_options', '[]'::jsonb)
  from jsonb_array_elements(p_items) as line(value);

  select coalesce(jsonb_agg(to_jsonb(item) order by item.created_at, item.id), '[]'::jsonb)
  into created_items from public.order_items item where item.order_id = created_order.id;

  return jsonb_build_object('order', to_jsonb(created_order), 'items', created_items, 'replayed', false);
end;
$$;

revoke all on function public.create_order_with_items(uuid, uuid, numeric, numeric, text, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.create_order_with_items(uuid, uuid, numeric, numeric, text, jsonb, jsonb, jsonb)
  to service_role;
