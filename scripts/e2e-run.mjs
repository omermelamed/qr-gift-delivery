/**
 * Runs the Playwright E2E suite against the LOCAL Supabase stack.
 *
 * Next inlines NEXT_PUBLIC_* into the client bundle at compile time from the
 * dotenv files; `.env.local` (remote project) would otherwise win. We write a
 * temporary `.env.development.local` (higher precedence than `.env.local` in
 * dev) so both server and client use local Supabase, clear the Turbopack cache
 * so the client bundle recompiles, then restore/remove the file afterwards so
 * the normal `npm run dev` workflow is untouched.
 *
 * Prereq: `node scripts/e2e-db.mjs && node scripts/seed-e2e.mjs`.
 * Usage:  node scripts/e2e-run.mjs   (or: npm run test:e2e)
 */
import { execSync } from 'node:child_process'
import { writeFileSync, rmSync, existsSync, copyFileSync } from 'node:fs'

const ENV_FILE = '.env.development.local'
const BACKUP = '.env.development.local.e2e-bak'

const LOCAL_ENV = [
  'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0',
  'SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU',
  'NEXT_PUBLIC_APP_URL=http://localhost:3000',
  'SMS_MOCK=true',
  '',
].join('\n')

const hadExisting = existsSync(ENV_FILE)
if (hadExisting) copyFileSync(ENV_FILE, BACKUP)

try {
  writeFileSync(ENV_FILE, LOCAL_ENV)
  execSync('rm -rf .next', { stdio: 'inherit' })
  execSync(`npx playwright test ${process.argv.slice(2).join(' ')}`.trim(), { stdio: 'inherit' })
} finally {
  if (hadExisting) { copyFileSync(BACKUP, ENV_FILE); rmSync(BACKUP, { force: true }) }
  else rmSync(ENV_FILE, { force: true })
}
