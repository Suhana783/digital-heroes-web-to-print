# Catalogue API and manual checks

The catalogue API reads through the server-side Supabase anon client, so database RLS continues to filter inactive records. The Part 2 migration must be applied before these routes can be tested. Sample content also requires running `supabase/seed.sql` after the migration.

## Endpoints

| Method and path | Result |
| --- | --- |
| `GET /api/catalogue/divisions` | Active divisions ordered by `sort_order`, then name. |
| `GET /api/catalogue/divisions/:divisionSlug/products` | Active products plus division details; an empty division returns an empty list and a clear message. |
| `GET /api/catalogue/divisions/:divisionSlug/products/:productSlug` | Product details, ordered option groups and active values, and ordered quantity tiers. Slugs are matched together. |
| `POST /api/pricing/calculate` | Validates configuration IDs and quantity, fetches current prices from Supabase, and returns a server-calculated breakdown. |

Successful responses use `{ "success": true, "message": "…", "data": … }`. Invalid slug syntax returns 400, unknown division or product returns 404, and Supabase errors return a generic 503 message without database internals.

The pricing request accepts only identifiers and quantity; submitted prices are ignored because they are not part of the contract:

```json
{
  "productId": "product-uuid",
  "quantity": 100,
  "selectedOptions": [
    { "optionGroupId": "group-uuid", "optionValueIds": ["value-uuid"] }
  ],
  "customInputs": [
    { "optionGroupId": "text-group-uuid", "value": "Customer supplied text" }
  ]
}
```

Custom values are accepted only for `text`, `number`, and `color` groups. They are validated and echoed in the result but do not affect price. Money fields in the calculation response are decimal strings; the response includes a currency code from `PRICE_CURRENCY` (default `INR`). See [pricing-rules.md](pricing-rules.md) for the calculation policy.

## Local manual verification

Start the API and client in separate terminals:

```bash
cd server && npm run dev
cd client && npm run dev
```

Check the API in a browser or with `curl`:

```text
http://localhost:5000/api/health
http://localhost:5000/api/catalogue/divisions
http://localhost:5000/api/catalogue/divisions/labels-stickers/products
http://localhost:5000/api/catalogue/divisions/labels-stickers/products/custom-vinyl-stickers
```

Use the product detail response to obtain current IDs for a price calculation:

```text
POST http://localhost:5000/api/pricing/calculate
Content-Type: application/json

{"productId":"…","quantity":100,"selectedOptions":[{"optionGroupId":"…","optionValueIds":["…"]}],"customInputs":[]}
```

After applying the migration and seed, expect six active divisions, products under the sample divisions, and option and tier data on product detail responses. In the client, open `http://localhost:5173/`, select a division, then select a product. Also try a made-up division/product slug (not-found state), a division with no products (empty state), stopping the API (network error with retry), and a slow network (loading state). The homepage and listing/detail layouts collapse to one column on narrow screens.
