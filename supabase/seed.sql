-- Idempotent sample catalogue. Safe to run again after the migration.
-- This seed intentionally does not create Auth users or promote roles.
-- Create/confirm the demo user through Supabase Auth, then run
-- scripts/promote-confirmed-user-to-admin.sql as the project owner.
insert into public.product_divisions (name, slug, description, sort_order) values
  ('Labels & Stickers', 'labels-stickers', 'Custom labels and stickers for products, events, and everyday use.', 1),
  ('Race & Event Numbers', 'race-event-numbers', 'Numbers and markings for races and organized events.', 2),
  ('MTB Boards', 'mtb-boards', 'Custom boards and number plates for mountain biking.', 3),
  ('Stamps', 'stamps', 'Rubber and self-inking stamps for business and personal use.', 4),
  ('Trophies', 'trophies', 'Awards and trophies for milestones and competition.', 5),
  ('Laser-Cut Work', 'laser-cut-work', 'Precision-cut pieces for signage, display, and custom projects.', 6)
on conflict (slug) do update set
  name = excluded.name,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.products (division_id, name, slug, description, base_price, pricing_model)
select division.id, sample.name, sample.slug, sample.description, sample.base_price, sample.pricing_model
from (values
  ('labels-stickers', 'Custom Vinyl Stickers', 'custom-vinyl-stickers', 'Durable custom-cut vinyl stickers.', 5.00::numeric, 'combined'),
  ('labels-stickers', 'Product Labels', 'product-labels', 'Printed labels for product packaging.', 12.00::numeric, 'combined'),
  ('race-event-numbers', 'Race Bib Numbers', 'race-bib-numbers', 'Personalized number bibs for race day.', 8.00::numeric, 'quantity_tiers'),
  ('mtb-boards', 'Custom MTB Number Board', 'custom-mtb-number-board', 'A personalized number board for the trail.', 18.00::numeric, 'options'),
  ('stamps', 'Self-Inking Stamp', 'self-inking-stamp', 'A custom self-inking office stamp.', 24.00::numeric, 'options'),
  ('trophies', 'Engraved Trophy', 'engraved-trophy', 'A customizable engraved award trophy.', 35.00::numeric, 'options'),
  ('laser-cut-work', 'Laser-Cut Sign', 'laser-cut-sign', 'A made-to-order laser-cut sign.', 28.00::numeric, 'options')
) as sample(division_slug, name, slug, description, base_price, pricing_model)
join public.product_divisions division on division.slug = sample.division_slug
on conflict (division_id, slug) do update set
  name = excluded.name,
  description = excluded.description,
  base_price = excluded.base_price,
  pricing_model = excluded.pricing_model,
  is_active = true;

insert into public.product_option_groups (product_id, name, input_type, is_required, sort_order)
select product.id, sample.name, sample.input_type, sample.is_required, sample.sort_order
from (values
  ('custom-vinyl-stickers', 'Size', 'select', true, 1),
  ('custom-vinyl-stickers', 'Finish', 'select', true, 2),
  ('product-labels', 'Material', 'select', true, 1),
  ('product-labels', 'Finish', 'select', false, 2),
  ('custom-mtb-number-board', 'Board Size', 'select', true, 1),
  ('self-inking-stamp', 'Ink Color', 'select', true, 1),
  ('engraved-trophy', 'Engraving', 'text', true, 1),
  ('laser-cut-sign', 'Material', 'select', true, 1)
) as sample(product_slug, name, input_type, is_required, sort_order)
join public.products product on product.slug = sample.product_slug
on conflict (product_id, name) do update set
  input_type = excluded.input_type,
  is_required = excluded.is_required,
  sort_order = excluded.sort_order;

insert into public.product_option_values (option_group_id, label, price_adjustment, adjustment_type, sort_order)
select option_group.id, sample.label, sample.price_adjustment, sample.adjustment_type, sample.sort_order
from (values
  ('custom-vinyl-stickers', 'Size', 'Small', 0.00::numeric, 'fixed', 1),
  ('custom-vinyl-stickers', 'Size', 'Large', 3.00::numeric, 'fixed', 2),
  ('custom-vinyl-stickers', 'Finish', 'Matte', 0.00::numeric, 'fixed', 1),
  ('custom-vinyl-stickers', 'Finish', 'Gloss', 1.50::numeric, 'fixed', 2),
  ('product-labels', 'Material', 'Paper', 0.00::numeric, 'fixed', 1),
  ('product-labels', 'Material', 'Vinyl', 4.00::numeric, 'fixed', 2),
  ('product-labels', 'Finish', 'Matte', 0.00::numeric, 'fixed', 1),
  ('product-labels', 'Finish', 'Gloss', 2.00::numeric, 'fixed', 2),
  ('custom-mtb-number-board', 'Board Size', 'Standard', 0.00::numeric, 'fixed', 1),
  ('custom-mtb-number-board', 'Board Size', 'Large', 5.00::numeric, 'fixed', 2),
  ('self-inking-stamp', 'Ink Color', 'Black', 0.00::numeric, 'fixed', 1),
  ('self-inking-stamp', 'Ink Color', 'Blue', 0.00::numeric, 'fixed', 2),
  ('laser-cut-sign', 'Material', 'Plywood', 0.00::numeric, 'fixed', 1),
  ('laser-cut-sign', 'Material', 'Acrylic', 8.00::numeric, 'fixed', 2)
) as sample(product_slug, group_name, label, price_adjustment, adjustment_type, sort_order)
join public.products product on product.slug = sample.product_slug
join public.product_option_groups option_group
  on option_group.product_id = product.id and option_group.name = sample.group_name
on conflict (option_group_id, label) do update set
  price_adjustment = excluded.price_adjustment,
  adjustment_type = excluded.adjustment_type,
  is_active = true,
  sort_order = excluded.sort_order;

insert into public.product_quantity_tiers (product_id, min_quantity, max_quantity, unit_price)
select product.id, sample.min_quantity, sample.max_quantity, sample.unit_price
from (values
  ('race-bib-numbers', 1, 24, 8.00::numeric),
  ('race-bib-numbers', 25, 99, 6.50::numeric),
  ('race-bib-numbers', 100, null::integer, 5.00::numeric),
  ('product-labels', 1, 99, 0.12::numeric),
  ('product-labels', 100, 499, 0.09::numeric),
  ('product-labels', 500, null::integer, 0.07::numeric)
) as sample(product_slug, min_quantity, max_quantity, unit_price)
join public.products product on product.slug = sample.product_slug
on conflict (product_id, min_quantity) do update set
  max_quantity = excluded.max_quantity,
  unit_price = excluded.unit_price;
