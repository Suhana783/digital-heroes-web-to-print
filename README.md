# Digital Heroes Web-to-Print Platform

Digital Heroes is a web-to-print MVP for six print and fabrication divisions: labels and stickers, race and event numbers, MTB boards, stamps, trophies, and laser-cut work. The application connects product configuration and server-side pricing to customer orders, artwork, saved designs, proofs, production tracking, reporting, and a local payment sandbox.

The repository contains an implementation of the main MVP workflows. It is **not verified as production-ready**: remote database migration state, deployed-provider configuration, and complete end-to-end behavior still need owner review. See [the PRD compliance review](docs/prd-compliance-review.md) and [final testing and deployment notes](docs/final-testing-and-deployment.md) for scope and limitations.

## Project information

- **Purpose:** Let customers configure print products, place and track orders, provide artwork, and review proofs; give administrators tools to manage products, templates, orders, proofs, and production stages.
- **Divisions:** Labels and stickers, race and event numbers, MTB boards, stamps, trophies, and laser-cut work.
- **Application:** A React/Vite browser client and a separate Node.js/Express API, backed by Supabase PostgreSQL, Auth, and private Storage.
- **Status:** Web-to-print MVP. Some database migrations still require reconciliation with the target Supabase project, and deployment and end-to-end behavior have not been fully verified.

## What is included

- **Catalogue and pricing:** Six divisions, configurable products and options, and price calculations performed by the Express API using catalogue data.
- **Customer accounts and orders:** Supabase Auth, customer profiles, checkout, order history, ownership checks, and reorder with server-side repricing.
- **Saved designs and artwork:** A browser editor for template-based text and image designs, private customer artwork uploads, and order-item design references. The saved-design/order-item association needs migration `20261125000700_link_saved_designs_to_order_items.sql` applied before it can be used in the target database.
- **CSV variable data:** CSV preview and field mapping, batch history, and basic per-row PDF output stored in private Supabase Storage.
- **Proofs and production:** Versioned proofs, customer approval or change requests, admin proof review, production-file eligibility checks, and order production stages.
- **Admin and reports:** Protected product/template management, order and production views, and operational reports.
- **Payments:** A local mock payment sandbox and optional Razorpay TEST-mode integration. Mock payments are rejected in production mode. Razorpay live payments are not enabled.

These workflows have limitations: generated PDFs are MVP output rather than professional prepress files; saved designs are not automatically converted into order artwork; tax/VAT and transactional email are not implemented; and automated tests do not cover live Supabase or browser workflows.

## Technology

| Area | Stack |
| --- | --- |
| Frontend | React, Vite, JavaScript ES modules, Tailwind CSS, React Router |
| Backend | Node.js, Express, JavaScript ES modules |
| Database and identity | Supabase PostgreSQL and Supabase Auth |
| File storage | Private Supabase Storage buckets |
| Payments | Local mock sandbox; optional Razorpay TEST mode |

## Repository layout

```text
client/                 React/Vite application
  src/                  pages, components, routes, state, services, styles
server/                 Express API
  src/                  routes, controllers, middleware, services, validators
supabase/
  migrations/           timestamped database changes
  seed.sql              initial product catalogue seed
docs/                   architecture, feature and operational documentation
```

The client and server are separate npm applications. Install and run their dependencies from their respective directories; there is no root-level npm package.

## Requirements

- Node.js 20 or newer
- npm
- A Supabase project for database, authentication, and storage-backed workflows

## Local development

### 1. Configure the client

```bash
cd client
npm install
```

Create the git-ignored `client/.env` and set the client configuration:

```env
VITE_API_URL=http://localhost:5000
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Start the Vite development server:

```bash
npm run dev
```

The default local URL is usually `http://localhost:5173`. Create or preview a production bundle with `npm run build` and `npm run preview`.

### 2. Configure the API

In another terminal:

```bash
cd server
npm install
```

Create `server/.env` using `server/.env.example` as a reference. Set the Supabase project URL, anon key, and **server-only** service-role key. A local development configuration can include:

```env
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:5173
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_server_only_service_role_key
PRICE_CURRENCY=INR
PAYMENT_MODE=mock
MOCK_PAYMENT_SECRET=your_local_mock_secret
```

The mock secret is optional in the application configuration; set one for local use when using the mock flow. Do not use a service-role key in the client or in any `VITE_` variable.

Start the API:

```bash
npm run dev
```

Use `npm start` to run without Nodemon. The API defaults to port `5000` and the client to Vite's default port `5173`.

### Optional Razorpay TEST mode

Razorpay is optional. To use it locally, select `PAYMENT_MODE=razorpay` and configure test credentials only in `server/.env`:

```env
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_test_key_secret
```

The key secret stays on the server. The application does not enable live Razorpay payments. Read [payment integration](docs/payment-integration.md) before configuring this mode.

## Environment variables

Use `server/.env.example` as the backend variable-name reference. Client variables are listed below; keep local values in ignored `.env` files and deployment values in provider settings.

| Application | Variables |
| --- | --- |
| Client | `VITE_API_URL`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`; optional demo-only `VITE_SHOW_DEMO_ADMIN`, `VITE_DEMO_ADMIN_EMAIL`, `VITE_DEMO_ADMIN_PASSWORD` |
| Server | `PORT`, `CLIENT_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PRICE_CURRENCY`, `PAYMENT_MODE`, `MOCK_PAYMENT_SECRET`, optional `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` |

Never commit `.env` files, put server secrets in `VITE_` variables, or expose the Supabase service-role key to browser code. Demo admin credentials supplied through `VITE_` variables are public in the browser bundle; only use them with an isolated demo project and disposable sample data.

For a reviewer-only demo deployment, set these client variables:

```env
VITE_SHOW_DEMO_ADMIN=true
VITE_DEMO_ADMIN_EMAIL=demo-admin@example.test
VITE_DEMO_ADMIN_PASSWORD=replace-with-disposable-demo-password
```

The login helper only displays and prefills this dedicated account; it does not create or promote it. See [admin roles](docs/admin-roles.md) and the [manual promotion SQL](supabase/scripts/promote-confirmed-user-to-admin.sql). Do not enable this helper for production or reuse a real admin password.

## Supabase database setup

The local repository contains ordered, timestamped migrations in `supabase/migrations/`. They define the catalogue, customer/order data, artwork, roles, proofs, production workflow, templates/designs, variable-data batches, payments, and design-to-order-item association.

Remote migration history has not been verified in this environment. Before changing a database:

1. Sign in to and link the Supabase CLI to the intended project.
2. Inspect remote migration history and compare it to the local migration files.
3. Review the pending migration plan and apply only migrations confirmed missing, in timestamp order.
4. Never reset a populated database or rerun an already-applied migration.

The saved-design/order-item association is in `20261125000700_link_saved_designs_to_order_items.sql`. It is additive and has not been applied automatically. Design-linked checkout depends on that migration. The project seed file is for initial catalogue data; do not run it blindly against an existing catalogue. New accounts receive the `customer` role; project owners can promote a confirmed account with [`supabase/scripts/promote-confirmed-user-to-admin.sql`](supabase/scripts/promote-confirmed-user-to-admin.sql). See [admin roles](docs/admin-roles.md), [database schema](docs/database-schema.md), [saved-design linking](docs/saved-design-order-linking.md), and [final testing and deployment](docs/final-testing-and-deployment.md).

## API health check

With the API running, open `http://localhost:5000/api/health` or run:

```bash
curl http://localhost:5000/api/health
```

This indicates that the API process responds. It does not verify the database connection, Supabase Storage, or other dependencies.

## Tests and build

Run the server's existing Node.js built-in test suite:

```bash
cd server
npm test
```

Build the frontend:

```bash
cd client
npm run build
```

There is no configured client test script, and the server suite uses Node's test runner rather than Jest. Passing these checks does not verify live Supabase policies, payment-provider behavior, or the complete browser journey. Current results and coverage limits are documented in [final testing and deployment](docs/final-testing-and-deployment.md).

## Deploy the client to Vercel

This section deploys the **React/Vite client**. The Express API is a separate service and must be deployed to a Node.js host that can serve the `/api` endpoints. Supabase remains the database, authentication, and storage provider. Do not put backend credentials in Vercel client environment variables.

1. Push the repository to a Git provider and import it as a new Vercel project.
2. Set the Vercel **Root Directory** to `client`.
3. Use the Vite framework preset. The project uses `npm run build` and produces static assets in `dist`; verify these settings in Vercel if they are not detected automatically.
4. Add these **client** environment variables for the Vercel Production environment (and Preview if needed):

   ```env
   VITE_API_URL=https://your-api-host.example
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

   Replace the API URL with the deployed Express API URL. Only the Supabase anon/publishable key belongs in the browser. Never add `SUPABASE_SERVICE_ROLE_KEY`, `RAZORPAY_KEY_SECRET`, or other backend secrets to this Vercel client project.

5. `client/vercel.json` routes React Router paths to the SPA entry page on direct navigation and refresh:

   ```json
   {
     "rewrites": [
       { "source": "/(.*)", "destination": "/index.html" }
     ]
   }
   ```

6. Deploy, then configure the Supabase Auth site/redirect URLs and the API's `CLIENT_URL` with the resulting Vercel origin. Confirm CORS, login redirects, direct loading of customer/admin routes, and API requests in a staging environment.

The Vercel deployment does not deploy the Express API or apply Supabase migrations. Reconcile database migration history before release; do not assume migrations in this local repository have been applied remotely. See the [official Vite on Vercel guide](https://vercel.com/docs/frameworks/frontend/vite) for current Vercel build and SPA routing details.
