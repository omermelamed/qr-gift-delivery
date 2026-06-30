/**
 * Boots a clean local Supabase DB for E2E and applies all committed migrations
 * as the `supabase_admin` superuser.
 *
 * Why this exists: migration 20240101000002_rls_policies.sql creates helper
 * functions in the `auth` schema (owned by supabase_admin). The Supabase CLI's
 * migration runner applies as a role that lacks CREATE on `auth`, so `supabase
 * start` / `db reset` roll back. We instead bring up a clean stack with the
 * migrations held aside, then apply every migration via psql as supabase_admin
 * (superuser, owns auth) — committed migrations are never modified.
 *
 * Usage: node scripts/e2e-db.mjs
 */
import { execSync } from 'node:child_process'
import { readdirSync, renameSync, mkdirSync, existsSync, rmdirSync, writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const ADMIN_URL = 'postgresql://supabase_admin:postgres@127.0.0.1:54322/postgres'
const MIG = 'supabase/migrations'
const HOLD = 'supabase/.migrations-hold'

const run = (cmd) => execSync(cmd, { stdio: 'inherit' })

function holdMigrations() {
  mkdirSync(HOLD, { recursive: true })
  for (const f of readdirSync(MIG).filter((f) => f.endsWith('.sql'))) {
    renameSync(path.join(MIG, f), path.join(HOLD, f))
  }
}

function restoreMigrations() {
  if (!existsSync(HOLD)) return
  for (const f of readdirSync(HOLD)) renameSync(path.join(HOLD, f), path.join(MIG, f))
  rmdirSync(HOLD)
}

try {
  try { run('npx supabase stop --no-backup') } catch { /* not running */ }

  // Bring up a clean stack with no app migrations (only base auth/storage schemas).
  holdMigrations()
  run('npx supabase start')
  restoreMigrations()

  // Local-only shim: the committed migrations define the JWT helpers in `auth`
  // (migration 2) but later migrations (8, 9, 16, 18) reference them as
  // `public.*`. Prod evidently has public copies created out-of-band that are
  // NOT in the migration history, so a from-scratch apply needs them. Create
  // them up front (they only depend on the built-in auth.jwt()).
  const SHIM = [
    "create or replace function public.jwt_company_id() returns uuid language sql stable as $$ select (auth.jwt() -> 'app_metadata' ->> 'company_id')::uuid $$;",
    "create or replace function public.jwt_role_name() returns text language sql stable as $$ select coalesce(auth.jwt() -> 'app_metadata' ->> 'role_name', '') $$;",
    "create or replace function public.is_platform_admin() returns boolean language sql stable as $$ select public.jwt_role_name() = 'platform_admin' $$;",
  ].join('\n')
  const shimFile = path.join(os.tmpdir(), 'e2e-jwt-shim.sql')
  writeFileSync(shimFile, SHIM)
  execSync(`psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -q -f "${shimFile}"`, { stdio: ['ignore', 'ignore', 'inherit'] })
  rmSync(shimFile, { force: true })

  // Apply every migration in order as the superuser that owns the auth schema.
  const files = readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()
  for (const f of files) {
    process.stdout.write(`  apply ${f} … `)
    execSync(`psql "${ADMIN_URL}" -v ON_ERROR_STOP=1 -q -f "${path.join(MIG, f)}"`, { stdio: ['ignore', 'ignore', 'inherit'] })
    process.stdout.write('ok\n')
  }
  console.log(`\n✅ local E2E DB ready — applied ${files.length} migrations as supabase_admin`)
} finally {
  restoreMigrations()
}
