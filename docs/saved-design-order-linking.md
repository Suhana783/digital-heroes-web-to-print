# Saved design to order-item linking

## Customer flow

The customer chooses an existing saved design for the same product from each cart line. The cart keeps the design ID and display name through repricing, and checkout sends the design ID with that order item. A customer may continue without a saved design or choose a different design for another cart line.

The backend accepts only a UUID, resolves the current product price from the catalogue, and queries the saved design using both its ID and the authenticated customer ID. It rejects a design that is not owned by that customer or whose product differs from the repriced product. The design ID is included in the trusted order item payload; totals and product data remain server-calculated.

The order details API returns the nullable design relationship. Customers see the design name/template and can reopen it from their own account. The admin production/order list and proof details also show the linked design name and template. Reorder carries the original design ID through the same ownership/product checks.

## Database and integrity

`supabase/migrations/20261125000700_link_saved_designs_to_order_items.sql` adds nullable `order_items.customer_design_id`, a partial index, and a trigger that rejects links unless the design owner matches the order customer and the design product matches the order item product. It extends the existing atomic `create_order_with_items` RPC to persist the field while preserving its signature and service-role-only execute grant. Existing order items remain `NULL` and are preserved.

The foreign key uses `ON DELETE RESTRICT` so a saved design linked to an order cannot be silently removed. The designer API checks this condition before cleaning up assets and returns a conflict response. No RLS policy was weakened and browser roles still cannot write order items.

The migration has not been applied automatically. Until it is applied, orders without a design continue to work; a checkout that selects a saved design fails clearly rather than silently creating an unlinked order. Apply it only after reviewing the target project's migration history and using the owner's approved migration workflow.

## Verification

- `cd server && npm test` — passed, 51 tests, 0 failures. New coverage includes optional/invalid design IDs, customer ownership, product matching, and refusing to drop a design link when the database migration is missing.
- `cd client && npm run build` — passed. Vite emitted its existing non-fatal warning that the main JavaScript chunk is larger than 500 kB after minification.
- No live database query or manual browser/API test was run. The migration remains unapplied, and this report does not claim live schema verification.
- No Supabase migration was applied, no production database was changed, and no deployment was performed.

## Limitations

- The cart selection links a saved design record; it does not convert the saved canvas into order artwork or generate a production file. Customers can still use the existing order artwork upload workflow.
- The relationship stores one optional saved design per order item. Variable-data batches and individual batch outputs remain associated with saved designs/batches as before; this change does not associate them with order items.
