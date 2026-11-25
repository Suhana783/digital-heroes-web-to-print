# CSV variable-data merge

Part 11 provides an authenticated MVP for producing one basic PDF per row from a saved customer design.

## Supported CSV format

- Upload a UTF-8 `.csv` file with one header row and at least one data row.
- Quoted fields, commas and line breaks inside quoted fields, and escaped double quotes (`""`) are supported.
- Files are limited to 1 MB, 50 columns, 100 data rows, 100 characters per header, and 3,000 characters per cell.
- Each PDF is limited to 20 MB and all successful PDFs in one batch together are limited to 100 MB.
- Headers must be nonempty and unique (case-insensitive). Every data row must have the same number of values as the header row.
- Blank lines are ignored. Malformed quoting, invalid UTF-8, empty data, and inconsistent row widths are rejected.

## Placeholder mapping

Use text elements in a saved design with tokens such as `{{name}}`, `{{number}}`, or `{{category}}`. Create the text element in the browser designer, enter its token, and save. The merge page detects tokens in saved text elements and requires a CSV column mapping for each unique token. The server rechecks mappings and substitutes values as text while keeping the element's saved geometry, font, color, and rotation.

## Generation and batches

The merge page previews the uploaded headers and first five rows. Starting a batch uploads and parses the CSV again on the server, verifies ownership of the selected saved design, creates a batch row, and renders the rows sequentially. Each output is stored in the existing private `generated-print-files` bucket and linked to its customer, design, batch, and source row. Batch records retain the original CSV filename, total rows, successful output count, per-row failures, and status; CSV contents are not retained in the database. Batch history refreshes during generation and lets the owner download each output through a short-lived signed URL.

## API endpoints

All endpoints require the existing Supabase-authenticated customer session:

- `POST /api/variable-data/preview` — multipart `file` CSV upload; returns headers, row count, and up to five preview rows.
- `POST /api/variable-data/batches` — multipart `file`, `designId`, and `mapping` JSON object (`placeholder` to exact CSV header); generates a batch.
- `GET /api/variable-data/batches` — lists only the caller's batches and output metadata.
- `GET /api/variable-data/batches/:batchId/outputs/:outputId/download` — verifies output ownership and returns a short-lived private download URL.

## Storage and security

The CSV is parsed in memory and is not persisted. PDF outputs use random storage object paths in the existing private bucket. Only authenticated server routes use the service-role client. The database migration adds owner-scoped batch and output metadata tables with RLS read policies; browser roles receive no table grants and there are no Storage object policies. API responses omit internal Storage paths.

## MVP limitations

- PDFs are basic visual exports, not production-ready print files. Canvas coordinate units are mapped 1:1 to PDF points; this does not claim a physical print size.
- CMYK, bleed, imposition, font embedding beyond PDF standard fonts, and prepress validation are not provided.
- PNG/JPG images and text elements are supported. PDF, SVG, and AI design assets are not composited into these generated outputs.
- Text is wrapped within its saved element box. A row fails if the personalized text does not fit or uses characters unsupported by the selected PDF standard font; other rows can still succeed.
- Batches run sequentially in the Express process, with a maximum of 100 output rows. This is intended for the MVP rather than large jobs or durable background processing; a server interruption can leave a batch marked `processing` until it is manually reviewed.
