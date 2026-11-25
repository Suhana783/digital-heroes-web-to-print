# Product templates and browser designer

Part 10 adds reusable, administrator-managed product templates and account-owned customer designs.

## Database

Apply `supabase/migrations/20261125000200_product_templates_saved_designs.sql` after the existing migrations. It creates:

- `public.product_templates`: product association, administrator-entered canvas and printable-area coordinate units, background color, allowed element types, future placeholder JSON, and activation state.
- `public.customer_designs`: owner, product, template, saved name, and design JSON. The creation-time template geometry is snapshotted in `design_data` so reopening a design preserves its original layout.
- `public.design_assets`: private-upload metadata for files belonging to a saved design.
- Private `designer-assets` Storage bucket, capped at 10 MB per file.

No physical product dimensions are seeded. Admins must enter verified specifications before activating templates. Browser roles have read-only access to active templates and owner-scoped design metadata; all writes and Storage access go through the authenticated server.

## Routes and pages

- Admin: `/admin/templates` (API under `/api/admin/templates`), guarded by existing authentication and `requireAdmin` middleware.
- Customer: `/account/designs` and `/account/designer` (API under `/api/designer`), guarded by the existing Supabase-auth session middleware.
- Product pages link to the designer. Only products with an active template can be started.

The customer editor supports text and PNG/JPG canvas elements, pointer dragging, numeric size/position/rotation controls, color and font controls, and removal. Saving and reopening use owner-scoped APIs. The server validates each element, including its rotated bounds, against the template's snapshotted printable area.

## Upload support and limits

PDF, SVG, AI/PostScript, PNG, and JPG originals are stored privately after server-side extension, MIME, size, and file-signature validation. PNG/JPG can be placed on the canvas. PDF, SVG, and AI are retained as original downloads and are explicitly identified as not editable in this browser MVP. Image previews and file downloads use short-lived signed URLs after design ownership is checked.

CSV placeholder mapping and basic per-row PDF export are implemented in Part 11; see [CSV variable-data merge](./csv-variable-data.md). These PDFs are not production-ready print files.
