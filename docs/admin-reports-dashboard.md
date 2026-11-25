# Admin reports and dashboard completion

Part 12 adds a database-backed admin report page, product activation controls, customer reorder and receipt actions, and a client-side admin route guard. Existing production stages and proof workflows remain the source of truth.

## Reports and data sources

The admin reports page is available at `/admin/reports` and uses `GET /api/admin/reports`.

- All-time order count and customer, product, and division counts come from `orders`, `user_roles`, `products`, and `product_divisions`.
- Selected-period order activity, statuses, production stages, completion/cancellation counts, order totals, and top products/divisions come from stored `orders` and `order_items`, with product division relationships from the catalogue.
- Order value excludes cancelled orders and groups values by currency. It is based on stored order totals; it does not represent collected or paid revenue.
- CSV batch/output counts and the ten latest batch summaries use `variable_data_batches` and saved-design relationships. If the Part 11 schema is not installed, the CSV section reports that the data is unavailable.

Date filters are `all`, `30`, `90`, or `custom`. Last 30/90 days use rolling UTC timestamps. Custom dates are inclusive UTC calendar dates; the API queries through midnight after the selected end date. Customer, product, and division totals remain all-time counts while order metrics use the selected range.

## Admin order and catalogue management

The existing `/admin/proofs` page remains the production and proof work area. It searches order number/customer details, filters order status, production stage and product type, shows customer contact and delivery information, artwork/proof versions, production eligibility, and applies the existing stage transition API and database rules. Completed orders remain in the list and can be found with the status/stage filters.

Product activation is available at `/admin/products`. It reuses the existing product list API and updates only `products.is_active` through `PATCH /api/admin/products/:productId/status`. Template-to-product associations continue to be managed at `/admin/templates`.

All admin pages use a frontend access check for navigation and user experience. Admin APIs remain protected by `requireAuth` and `requireAdmin`; the frontend check is not an authorization boundary.

## Customer dashboard completion

The account already includes profile edits, order history, proof status/version history, artwork downloads, saved designs, and Part 11 CSV batch history. Order detail now offers a reorder action that rebuilds the prior product/configuration request and uses the existing server repricing and order-placement workflow. Inactive or changed products/options can cause a reorder to be rejected; the customer sees the existing API error.

Order details link to a basic receipt view at `/account/orders/:orderId/receipt`. It uses the existing owner-scoped order endpoint and can be printed or saved as PDF through the browser. It clearly says it is not a tax invoice or proof of payment and shows the stored payment status.

## APIs added or reused

- `GET /api/admin/reports?period=all|30|90|custom&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD`
- `PATCH /api/admin/products/:productId/status` with `{ "is_active": true|false }`
- Existing production/order API: `GET /api/admin/production/orders` and `PUT /api/admin/production/orders/:orderId/stage`
- Existing customer APIs: `GET /api/orders`, `GET /api/orders/:orderId`, and `POST /api/orders` for repriced reorder placement
- Existing admin product-list and template APIs are reused.

## Known limitations and deferred work

- CSV batches are attached to saved designs, not order IDs. The report page shows them separately rather than implying a batch belongs to a particular order.
- The production list is fetched as a whole and searched/filtered in the browser; pagination is deferred.
- The database has completed and cancelled states but no separate archived state; those orders remain available in the production list and filters.
- The receipt is a browser-rendered order summary, not a tax-compliant document or a confirmation of payment.
- Payment attempts are available from the admin Payments page. The application supports a local mock sandbox and optional Razorpay TEST mode; it has no live-payment, accounting, Xero, or revenue-recognition integration.
- Product administration in this phase views existing products and activates/deactivates them; product creation, pricing edits, division management, and template editing remain in the existing workflows or are deferred.
- The reports are operational summaries, not a financial ledger or production-ready analytics system.
