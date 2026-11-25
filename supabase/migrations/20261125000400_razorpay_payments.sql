-- Razorpay test-mode payment metadata for existing customer orders.
-- Existing order totals and payment_status remain the authoritative application record.

alter table public.orders
  add column razorpay_order_id text,
  add column razorpay_payment_id text,
  add column payment_amount_paise bigint,
  add column payment_currency text,
  add column payment_verified_at timestamptz,
  add column payment_failure_reason text;

create unique index orders_razorpay_order_id_unique
  on public.orders (razorpay_order_id)
  where razorpay_order_id is not null;

create unique index orders_razorpay_payment_id_unique
  on public.orders (razorpay_payment_id)
  where razorpay_payment_id is not null;

alter table public.orders
  add constraint orders_payment_amount_paise_positive
    check (payment_amount_paise is null or payment_amount_paise > 0),
  add constraint orders_payment_currency_format
    check (payment_currency is null or payment_currency ~ '^[A-Z]{3}$'),
  add constraint orders_razorpay_metadata_consistent
    check (
      (razorpay_order_id is null and payment_amount_paise is null and payment_currency is null)
      or (razorpay_order_id is not null and payment_amount_paise is not null and payment_currency is not null)
    ),
  add constraint orders_payment_verified_consistent
    check (
      (razorpay_payment_id is null and payment_verified_at is null)
      or (razorpay_payment_id is not null and payment_verified_at is not null and payment_status = 'paid')
    );

-- Customer order APIs use only these columns. Keep provider IDs, payment amount
-- metadata, verification timestamps, and failure details server-side.
revoke select on public.orders from authenticated;
grant select (
  id, customer_id, order_number, status, production_stage, payment_status,
  subtotal, total_amount, currency, delivery_address, contact_snapshot,
  created_at, updated_at
) on public.orders to authenticated;
