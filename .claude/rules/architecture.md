# Architecture rules

## Architectural shape

Next.js App Router monorepo deployed on Vercel, with Supabase as the backend (Postgres + Auth + Storage + Realtime).

## API routes (server layer)

- API routes own HTTP logic, auth checks, and Supabase service-role operations
- keep token validation atomic — use a single UPDATE with WHERE clause, not a read-then-write
- never expose the Supabase service-role key to the browser
- validate inputs at API route boundaries; trust nothing from the client

## Frontend (client layer)

- pages compose feature components
- feature hooks own data fetching and mutations via the Supabase browser client (anon key, RLS-enforced)
- presentational components render props and callbacks only
- keep camera/QR scanner logic isolated in a single component

## Database (Supabase layer)

- schema is the source of truth — keep `gift_tokens` clean and migration-tracked
- RLS policies protect role separation: admin can see all, distributor can update tokens, employee has no direct access
- Supabase Realtime drives live dashboard updates — do not poll

## Cross-layer rule

When a change touches more than one layer, update in this order:
1. schema / RLS policy
2. API route
3. frontend integration
4. UI feedback
