# Product catalogue database schema

This schema stores the catalogue and the information needed by a future pricing calculator. It does not calculate a price. The SQL is in `supabase/migrations/20261124000100_create_product_catalogue.sql`; repeatable example data is in `supabase/seed.sql`.

## Tables and relationships

```text
product_divisions 1 ── many products
products          1 ── many product_option_groups
product_option_groups 1 ── many product_option_values
products          1 ── many product_quantity_tiers
```

| Table | What it stores | Important fields |
| --- | --- | --- |
| `product_divisions` | The top-level areas of the business. | `name`, unique URL-friendly `slug`, `is_active`, and `sort_order`. |
| `products` | An item customers can configure, belonging to one division. | `division_id` references a division; `base_price` is `numeric(12,2)`; `pricing_model` describes which stored inputs apply; `is_active` controls visibility. A slug is unique within its division. |
| `product_option_groups` | A question or choice presented for a product, such as Size or Finish. | `product_id` references its product; `input_type` is one of `select`, `multi_select`, `text`, `number`, or `color`; `is_required` and `sort_order` guide the future form. |
| `product_option_values` | The selectable values for a group, with an optional price adjustment. | `option_group_id` references the group; `price_adjustment` is exact numeric data; `adjustment_type` is `fixed` or `percentage`; `is_active` can hide an old choice without deleting it. A percentage reduction cannot exceed 100%. |
| `product_quantity_tiers` | Per-unit prices for quantity ranges of a product. | `min_quantity`, optional inclusive `max_quantity` (null means no upper limit), and `unit_price`. Tiers are sorted by minimum quantity. |

All tables use UUID primary keys and `created_at` / `updated_at` timestamps. Foreign keys prevent orphan records. Removing a division with products is restricted; removing a product or option group cascades to dependent configuration and tier rows. Prices use fixed-precision `numeric`, never floating point. Checks reject negative base/unit prices, invalid quantity bounds, blank names and invalid slugs. Indexes support division/product and ordered option/tier lookups. An update trigger refreshes `updated_at`.

## How options connect

For example, the sample `Custom Vinyl Stickers` product has a `Size` group with `Small` and `Large` values, and a `Finish` group with `Matte` and `Gloss` values. The group row points to the product; each value row points to its group. `Large` can add a fixed amount, while `Gloss` can add a different amount. Text input groups such as engraving have no predefined option values.

## How pricing data fits together

`base_price` is the starting price for one product unit. A selected option value can add a fixed amount or a percentage adjustment according to `adjustment_type`. A quantity tier gives the per-unit price when the ordered quantity falls between its minimum and maximum bounds (inclusive); a null maximum means the range continues upward. `pricing_model` records the intended combination: `base`, `options`, `quantity_tiers`, or `combined`.

These are stored inputs only. The later pricing engine must define and test how tier price, base price, option adjustments, and quantity are combined, including rounding and handling a quantity not covered by any configured tier. This schema prevents duplicate tier starting quantities and invalid bounds, but does not currently prevent overlapping tier ranges; maintain non-overlapping ranges when editing tiers.

## Row Level Security

RLS is enabled on all five tables. `anon` and `authenticated` roles receive SELECT only. Policies expose active divisions; active products whose division is active; option groups and tiers only when their product and division are active; and active option values only for an active product in an active division. Public roles receive no insert, update, delete, truncate, references, or trigger table privileges, and no write policies are defined. Data changes for now should be made by a trusted project owner in the Supabase SQL Editor.

Customer and administrator identity uses Supabase Auth with the database-backed `public.user_roles` model added in `docs/admin-roles.md`. Admin policies are based on the verified database role, while customer reads remain scoped to `auth.uid()`. Catalogue API reads use the anon key so RLS stays effective. A service role key remains privileged and must never be used in browser code.

## Apply in Supabase

1. Open the new Supabase project and choose **SQL Editor**.
2. Open `supabase/migrations/20261124000100_create_product_catalogue.sql`, paste the full file into a new query, and run it once.
3. Open `supabase/seed.sql`, paste it into a second query, and run it. It uses conflict handling so rerunning it updates the same sample rows instead of duplicating them.
4. Run the verification queries below. The application has not executed these SQL files or connected to Supabase as part of this change; confirm the results in your project.

## Verification queries

```sql
-- Expect five tables and RLS enabled on each.
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in (
    'product_divisions', 'products', 'product_option_groups',
    'product_option_values', 'product_quantity_tiers'
  )
order by c.relname;

-- Inspect the four foreign-key relationships.
select tc.table_name, kcu.column_name, ccu.table_name as referenced_table,
       ccu.column_name as referenced_column
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on tc.constraint_name = kcu.constraint_name and tc.constraint_schema = kcu.constraint_schema
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name and ccu.constraint_schema = tc.constraint_schema
where tc.constraint_type = 'FOREIGN KEY'
  and tc.constraint_schema = 'public'
  and tc.table_name in (
    'products', 'product_option_groups', 'product_option_values', 'product_quantity_tiers'
  )
order by tc.table_name, kcu.column_name;

-- Expect six divisions and seven sample products.
select d.name as division, count(p.id) as product_count
from public.product_divisions d
left join public.products p on p.division_id = d.id
group by d.id, d.name, d.sort_order
order by d.sort_order;

-- Inspect a sample product, its groups, and choices.
select d.name as division, p.name as product, g.name as option_group,
       g.input_type, g.is_required, v.label as option_value,
       v.price_adjustment, v.adjustment_type
from public.products p
join public.product_divisions d on d.id = p.division_id
left join public.product_option_groups g on g.product_id = p.id
left join public.product_option_values v on v.option_group_id = g.id and v.is_active
where p.slug = 'custom-vinyl-stickers'
order by g.sort_order, v.sort_order;

-- Inspect quantity breaks; null max_quantity means unlimited upper range.
select p.name, t.min_quantity, t.max_quantity, t.unit_price
from public.product_quantity_tiers t
join public.products p on p.id = t.product_id
order by p.name, t.min_quantity;

-- Expect zero rows: no browser write policies exist on these tables.
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public'
  and cmd <> 'SELECT'
  and tablename in (
    'product_divisions', 'products', 'product_option_groups',
    'product_option_values', 'product_quantity_tiers'
  )
order by tablename, policyname;
```
