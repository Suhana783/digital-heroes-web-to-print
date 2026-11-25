# Digital Heroes — Web-to-Print Platform

Digital Heroes is a web-to-print MVP for six custom print and fabrication divisions: labels and stickers, race and event numbers, MTB boards, stamps, trophies, and laser-cut work. It includes server-priced product configuration, Supabase customer accounts and orders, private artwork, a template-based browser designer, CSV variable-data PDFs, proof approval, an admin production workflow, operational reports, and a local mock payment sandbox with optional Razorpay TEST mode. See the [PRD compliance review](docs/prd-compliance-review.md) for scope and remaining limitations; this project is not represented as production-ready.

## Technology

- **Client:** React, Vite, JavaScript (ES modules), Tailwind CSS, React Router DOM
- **API:** Node.js, Express, dotenv, cors, Nodemon
- **Database connection:** Supabase PostgreSQL using `@supabase/supabase-js`
- **Deployment targets:** Vercel (client), Render (API), Supabase (database and private Storage); free-tier availability and limits vary by provider and account.

## Repository structure

```text
client/                 Vite React application
  public/
  src/
    assets/ components/ layouts/ pages/ features/
    hooks/ context/ services/ routes/ utils/ constants/ styles/
server/                 Express API
  src/
    config/ controllers/ routes/ middleware/ services/
    utils/ constants/ validators/
docs/
  architecture.md
README.md
.gitignore
```

Foundation files are added as their responsibilities begin; future feature folders do not contain placeholder modules.

## Prerequisites

Use Node.js 20 or newer and npm. Install dependencies separately in each application; there are no root-level npm dependencies.

## Frontend setup

```bash
cd client
npm install
npm run dev
```

Vite prints the local URL (normally `http://localhost:5173`). `npm run build` creates the production bundle and `npm run preview` serves that bundle locally. Tailwind CSS is integrated through its Vite plugin.

## Backend setup

```bash
cd server
npm install
npm run dev
```

The API listens on port 5000 by default. `npm start` starts it without Nodemon. Set `CLIENT_URL` to the exact frontend origin; a comma-separated list is accepted when more than one origin is needed. Run the server's existing Node.js built-in test suite with `npm test` from `server/`. It is not a Jest suite, and there is no client test script.

## Environment configuration

The client reads `VITE_API_URL` from `client/.env` (default: `http://localhost:5000/api`). Supabase Auth also needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; these publishable values are safe in the browser. Never place a service role key in a `VITE_` variable.

The server reads `PORT`, `NODE_ENV`, `CLIENT_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, optional `PRICE_CURRENCY` (default `INR`), and `SUPABASE_SERVICE_ROLE_KEY` for authorized server-side operations from `server/.env`. Payment configuration uses `PAYMENT_MODE=mock` for local development or `PAYMENT_MODE=razorpay` with backend-only `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` test credentials. `MOCK_PAYMENT_SECRET` is optional for local mock mode. Catalogue and customer-scoped reads use the anon key and customer JWT so RLS applies. Keep every secret server-only; configure local ignored `.env` files directly and never commit them. Placeholders are documented in the existing `.env.example` files.

## API health check

With the API running, visit `http://localhost:5000/api/health` or run:

```bash
curl http://localhost:5000/api/health
```

The route responds with HTTP 200 and JSON indicating that the API process is running. It does not claim that a database connection has been tested.

## Product pricing

The product page lets visitors configure options and request a server-calculated estimate through `POST /api/pricing/calculate`. The server retrieves current prices from Supabase, validates selected options, and returns exact decimal strings. Calculation rules, examples, and schema limits are documented in [docs/pricing-rules.md](docs/pricing-rules.md).

## Customer accounts

Supabase Auth powers registration and login. Protected customer pages call Express with the customer's access token; the API verifies it and applies customer ownership/RLS checks. Admin routes use the same verified Auth identity plus a database-backed role. Review remote migration history and the migration guidance in [docs/final-testing-and-deployment.md](docs/final-testing-and-deployment.md) before applying anything. Setup details are in [customer accounts](docs/customer-accounts.md), [checkout and orders](docs/checkout-orders.md), [artwork uploads](docs/artwork-uploads.md), [admin roles](docs/admin-roles.md), and [payment integration](docs/payment-integration.md).

## Supabase setup

1. Create or select the Supabase project and configure its Project URL, anon/publishable key, and service-role key only in the appropriate ignored local/server environment files.
2. Apply `supabase/seed.sql` only when setting up a fresh catalogue, after reviewing the schema. For an existing project, inspect migration history first and apply only missing timestamped migrations in order.
3. Use `supabase migration list --remote` to inspect history and `supabase db push --dry-run` to preview pending changes after CLI login/linking. Review the plan; do not reset production or rerun applied migrations. The service role key must never be exposed to the browser.

## Deployment preparation

### Vercel client

Import the repository into Vercel and set the project root to `client`. Use `npm run build` as the build command and `dist` as the output directory. Configure `VITE_API_URL` to the deployed API's `/api` base URL. Vite's SPA fallback should serve `index.html` for client-side routes.

### Render API

Create a Node web service from the repository with root directory `server`, build command `npm install`, and start command `npm start`. Configure `PORT` through Render's assigned port (the app honors `process.env.PORT`) and add `CLIENT_URL`, `NODE_ENV`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` in the Render environment settings. Use a Render plan available to your account; availability and limits can change. Update Vercel's `VITE_API_URL` after the Render URL is assigned.

Deployment requires real environment variables and migration reconciliation. Mock mode is disabled when `NODE_ENV=production`; use no payment mode until the payment configuration and payment database migrations are verified. Razorpay live mode is not implemented. Do not deploy using example credentials or treat successful builds as production readiness.

## Security notes

- Public catalogue queries use the Supabase anon key and rely on RLS. Do not use the elevated service role key for these requests.
- Never commit `.env` files or paste secrets into source control.
- The API health route is independent of Supabase and must not be interpreted as a database health check.
- CORS is restricted to `CLIENT_URL` origins configured on the server.

## Development roadmap

1–13. Project foundation through catalogue, checkout, accounts, artwork, admin roles, proof/production workflow, designer/templates, variable-data merge, reports, and payment sandbox.
14. Final integration and PRD review.
15. Final testing and deployment preparation; runtime, database, and provider-dependent checks remain subject to the status documented in [the final review](docs/final-testing-and-deployment.md).
