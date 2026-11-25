# Architecture

## Application boundaries

The repository contains two independent JavaScript applications. `client/` owns the browser experience: React renders pages and reusable interface elements, Vite serves the development build, Tailwind CSS provides styling, and React Router handles browser navigation. `server/` owns the HTTP API and its server-only integrations.

## Request flow

The React client sends HTTP requests to the Express API using the base URL in `VITE_API_URL`. Express parses JSON, applies CORS using the configured client origin, and dispatches requests through API routes to controllers. Protected account routes verify Supabase Auth access tokens and use the verified user's JWT for database queries. Controllers return HTTP responses; centralized middleware handles unknown routes and errors.

Public catalogue and pricing routes serve catalogue data and calculations. Protected account routes provide customer profile and order-history reads/updates.

## Supabase and data

Server services use the Supabase JavaScript client with the server-side anon key for customer-scoped reads and catalogue access. Protected administrative and storage operations use the server-only service-role client behind authentication, authorization, validation, and ownership checks. Catalogue reads rely on the Part 2 RLS policies. Client initialization is lazy and requires real server environment variables; placeholders produce a configuration error when the client is requested. Catalogue endpoints require the Part 2 migration and seed to be applied.

The Supabase service role key is privileged and must remain server-only. Never expose it through a `VITE_` variable or browser code. The browser uses the publishable anon key for Supabase Auth; RLS protects direct database access, while Express applies explicit customer ownership and admin-role checks to privileged operations.

## Domain modules

The client groups public catalogue pages, customer account and order pages, designer and variable-data tools, and administrator product, template, proof/production, report, and payment pages under `client/src/pages/`. Shared interface pieces live under `client/src/components/`; feature-specific browser state and presentation live under `client/src/features/`.

The API follows matching route, controller, service, validator, and middleware layers under `server/src/`. Supabase schema changes are represented by ordered timestamped SQL files under `supabase/migrations/`; private artwork and generated files are mediated by authenticated server routes. Domain documentation under `docs/` describes each workflow and its remaining MVP limits.
