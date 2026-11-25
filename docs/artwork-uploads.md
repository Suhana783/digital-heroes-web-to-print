# Customer artwork uploads

## Storage and data model

Run `supabase/migrations/20261124000400_customer_artwork_storage.sql` after the Part 5 and Part 6 migrations. It creates the private `customer-artwork` bucket with a 10 MB file limit and allowed MIME types for PDF, PNG, JPEG, and SVG. It also creates `public.artwork_files`, which stores file metadata and a private storage path, never the file contents.

Artwork metadata belongs to an authenticated customer and an order. `order_item_id` is optional for artwork that applies to a whole order. Composite foreign keys ensure the order belongs to the metadata customer and an associated item belongs to that order. The database prevents deleting an order or item while artwork still refers to it. Customers have RLS-protected read access to their own metadata; browser roles have no Storage object policies and cannot write metadata.

## Upload and download flow

On `/account/orders/:orderId`, customers can upload one file for the whole order or select a specific order item. The UI accepts PDF, PNG, JPG, JPEG, and SVG files up to 10 MB. Express parses multipart data with Node's built-in Web `Request.formData()` parser, limits the entire request size, and checks the extension, declared MIME type, and file signature/content before storage.

The API verifies the order (and selected order item) through the customer's verified access token before uploading. Storage object names use random UUIDs under `{customerId}/{orderId}/`; the original name is stored only as metadata. Storage is uploaded using the server-only service role. If metadata insertion fails, the API attempts to remove the uploaded object.

The artwork list endpoint uses the customer's JWT and RLS. The download endpoint also checks metadata ownership, then returns a signed URL that expires after 60 seconds and requests attachment download. The bucket remains private, storage paths are not returned in API responses, and uploaded SVG markup is never rendered by the app.

## API

- `POST /api/orders/:orderId/artwork` — authenticated multipart upload with `file` and optional `orderItemId` fields.
- `GET /api/orders/:orderId/artwork` — authenticated metadata list for an owned order.
- `GET /api/artwork/:artworkId/download` — authenticated, short-lived signed download URL for owned artwork.

All access uses the verified customer ID from the bearer token. An order or artwork belonging to another customer is reported as not found.

## Configuration and verification

No new environment variable is needed. The API uses `SUPABASE_SERVICE_ROLE_KEY` from the ignored `server/.env` only for private Storage operations and server-side metadata writes. Never copy it to the client or chat. The Part 7 migration creates the bucket when run; it has not been applied automatically.

Local checks cover multipart parsing, supported signatures, size limits, and rejected type mismatches. The client production build passes. A live upload, Storage object check, signed URL download, cross-customer request, and simulated database cleanup failure still require the Part 5, Part 6, and Part 7 migrations plus a configured server service role key. Those Supabase operations have not been reported as verified.
