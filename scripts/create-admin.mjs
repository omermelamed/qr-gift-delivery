/**
 * One-time script: creates a company_admin user in Supabase.
 * Usage: node scripts/create-admin.mjs
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env.local
 */

import { readFileSync } from 'fs'

// ── Parse .env.local ──────────────────────────────────────────────────────────
const env = {}
try {
  const raw = readFileSync('.env.local', 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (m) env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
} catch {
  console.error('Could not read .env.local — run this from the project root.')
  process.exit(1)
}

const SUPABASE_URL = env['NEXT_PUBLIC_SUPABASE_URL']
const SERVICE_KEY  = env['SUPABASE_SERVICE_ROLE_KEY']

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation',
}

// ── Helper: raw REST query ────────────────────────────────────────────────────
async function query(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { ...headers, ...(opts.headers ?? {}) },
    ...opts,
  })
  const body = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, body }
}

// ── Helper: auth admin API ────────────────────────────────────────────────────
async function authAdmin(path, method = 'GET', payload) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/admin/${path}`, {
    method,
    headers,
    body: payload ? JSON.stringify(payload) : undefined,
  })
  const body = await res.json().catch(() => null)
  return { ok: res.ok, status: res.status, body }
}

// ── 1. Check migrations are applied ──────────────────────────────────────────
const check = await query('companies?limit=1&select=id,name')
if (!check.ok) {
  const msg = check.body?.message ?? ''
  if (msg.includes('schema cache') || msg.includes('relation') || check.status === 404) {
    console.error(`
The "companies" table was not found in your Supabase project.
Your database migrations have not been applied yet.

To apply them, run each migration file in the Supabase SQL editor:
  https://supabase.com/dashboard/project/_/sql

Files to run in order:
  supabase/migrations/001_initial_schema.sql
  supabase/migrations/002_rls_policies.sql
  supabase/migrations/003_seed_roles_permissions.sql
  supabase/migrations/004_storage_bucket.sql
  supabase/migrations/005_admin_columns.sql

After running them, re-run this script.
`)
  } else {
    console.error('Database query failed:', msg || check.status)
  }
  process.exit(1)
}

// ── 2. Get or create company ──────────────────────────────────────────────────
let companyId
if (check.body?.length > 0) {
  companyId = check.body[0].id
  console.log(`Using existing company: "${check.body[0].name}" (${companyId})`)
} else {
  const r = await query('companies', {
    method: 'POST',
    body: JSON.stringify({ name: 'Demo Company', slug: 'demo' }),
  })
  if (!r.ok) { console.error('Failed to create company:', r.body?.message); process.exit(1) }
  const co = Array.isArray(r.body) ? r.body[0] : r.body
  companyId = co.id
  console.log(`Created company: "${co.name}" (${companyId})`)
}

// ── 3. Get company_admin system role ──────────────────────────────────────────
const roleRes = await query('roles?name=eq.company_admin&is_system=eq.true&select=id,name&limit=1')
if (!roleRes.ok || !roleRes.body?.length) {
  console.error('Could not find system role "company_admin". Did migration 003 run?')
  process.exit(1)
}
const roleId = roleRes.body[0].id
console.log(`Using role: "${roleRes.body[0].name}" (${roleId})`)

// ── 4. Create or update the admin user ────────────────────────────────────────
const EMAIL    = 'admin@giftflow.dev'
const PASSWORD = 'GiftFlow2026!'

const appMeta = { company_id: companyId, role_id: roleId, role_name: 'company_admin' }

// Check if user already exists
const listRes = await authAdmin(`users?email=${encodeURIComponent(EMAIL)}`)
const existing = listRes.body?.users?.find(u => u.email === EMAIL)

if (existing) {
  const upd = await authAdmin(`users/${existing.id}`, 'PUT', { app_metadata: appMeta })
  if (!upd.ok) { console.error('Failed to update user:', upd.body?.message); process.exit(1) }
  console.log('\nUpdated existing user metadata.')
} else {
  const cr = await authAdmin('users', 'POST', {
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    app_metadata: appMeta,
  })
  if (!cr.ok) { console.error('Failed to create user:', cr.body?.message); process.exit(1) }
  console.log('\nCreated new admin user.')
}

// ── Done ──────────────────────────────────────────────────────────────────────
console.log(`
✓ Admin user ready

  Email:    ${EMAIL}
  Password: ${PASSWORD}

  Open http://localhost:3000/login and sign in.
`)
