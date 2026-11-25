# Part 8: proof review and draft print files

## Database setup

Apply migrations in order through `20261124000600_proof_management_print_files.sql`. This migration depends on the order, artwork, and database-backed admin-role tables created by Parts 5–8 prerequisite (migrations `20261124000200` through `20261124000500`). Do not apply it until those tables are present in the linked Supabase project.

It creates private `order-proofs` and `generated-print-files` buckets, proof/version/event metadata, and generated print-file metadata. Authenticated clients receive SELECT only, scoped by order ownership or the existing `is_admin()` helper. Express uses the service-role key for writes only after auth and admin checks. The customer response RPC uses `auth.uid()` and verifies ownership and latest-version status in PostgreSQL.

## Workflow

- An administrator opens `/admin/proofs`, chooses an item, and reviews its order-specific or order-level artwork and saved option snapshot.
- The administrator may generate a draft PDF from PDF, PNG, or JPEG artwork, then uploads a separate PDF proof for customer review.
- Proof files and generated files remain in private buckets. The API returns short-lived signed download URLs and never returns storage paths.
- Customers see proof versions on their order details page, then approve the latest proof or request changes. A change request is retained in the proof event history; a later upload creates a new sequential version.
- Approved versions cannot be replaced. An item must have a change-requested latest version before another proof can be sent.

## Print-file limits

The current product schema has no structured dimensions or saved designer payload. For image artwork, the draft uses an A4 page and 36-point margins while preserving aspect ratio. Existing PDF pages are copied with their page sizes preserved. Product configuration is attached as PDF metadata and the print-file row. SVG conversion is not supported and returns an explicit error. These PDFs are labeled `draft_unvalidated`; they do not include CMYK conversion, imposition, crop marks, or prepress validation and must not be treated as production-ready.

## Verification

1. Confirm Parts 5–7 and the admin-role migration are present, then apply this migration once.
2. Start the backend and frontend with an admin account. Confirm `/api/admin/access-check` returns 200 and `/api/admin/proofs/queue` returns a queue.
3. As a customer, place an order, upload artwork, then verify the admin sees it on the corresponding item or order.
4. Generate a draft from PNG/JPG/PDF artwork. Confirm SVG produces a clear error and no print-file row.
5. Upload proof version 1, open the order as its customer, request changes, and verify the event is retained.
6. Upload version 2 and approve it as the customer. Confirm version 1 still exists and further customer responses or admin replacement are rejected.
7. Repeat API reads/downloads as another customer and as an unauthenticated user; other-customer files must remain unavailable, and admin routes must reject non-admins.

Live database and end-to-end authorization checks require the migration to be applied and valid Supabase connectivity. Do not put service-role credentials in the frontend environment.
