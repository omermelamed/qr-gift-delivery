/**
 * Seeds the local Supabase DB with one user per role plus a company, campaign,
 * and gift tokens, so the Playwright E2E smoke suite can exercise every surface.
 * Idempotent — safe to re-run. Run `node scripts/e2e-db.mjs` first.
 *
 * Usage: node scripts/seed-e2e.mjs
 */
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import QRCode from 'qrcode'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

const URL = process.env.SUPABASE_URL || 'http://127.0.0.1:54321'
// Standard local Supabase demo service-role key (stable across local installs).
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

export const E2E_PASSWORD = 'Test1234!'
export const E2E_USERS = {
  platform_admin: 'platform@e2e.test',
  company_admin: 'admin@e2e.test',
  scanner: 'scanner@e2e.test',
}

const admin = createClient(URL, SERVICE, { auth: { autoRefreshToken: false, persistSession: false } })

async function roleId(name) {
  const { data } = await admin.from('roles').select('id').eq('name', name).maybeSingle()
  return data?.id ?? null
}

async function upsertUser(email, app_metadata) {
  const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const existing = list.users.find((u) => u.email === email)
  if (existing) await admin.auth.admin.deleteUser(existing.id)
  const { data, error } = await admin.auth.admin.createUser({ email, password: E2E_PASSWORD, email_confirm: true, app_metadata })
  if (error) throw new Error(`createUser ${email}: ${error.message}`)
  return data.user
}

async function main() {
  // Company
  let { data: company } = await admin.from('companies').select('id').eq('slug', 'e2e-co').maybeSingle()
  if (!company) {
    const { data, error } = await admin.from('companies').insert({ name: 'E2E Co', slug: 'e2e-co', active: true }).select('id').single()
    if (error) throw new Error(`company: ${error.message}`)
    company = data
  }
  const companyId = company.id

  const companyAdminRole = await roleId('company_admin')
  const scannerRole = await roleId('scanner')
  const platformRole = await roleId('platform_admin')

  const platform = await upsertUser(E2E_USERS.platform_admin, { role_name: 'platform_admin', ...(platformRole ? { role_id: platformRole } : {}) })
  const companyAdmin = await upsertUser(E2E_USERS.company_admin, { company_id: companyId, role_id: companyAdminRole, role_name: 'company_admin' })
  const scanner = await upsertUser(E2E_USERS.scanner, { company_id: companyId, role_id: scannerRole, role_name: 'scanner' })

  await admin.from('user_company_roles').upsert(
    [
      { user_id: companyAdmin.id, company_id: companyId, role_id: companyAdminRole },
      { user_id: scanner.id, company_id: companyId, role_id: scannerRole },
    ],
    { onConflict: 'user_id,company_id' }
  )

  // Campaign (already sent, so it shows live stats)
  let { data: campaign } = await admin.from('campaigns').select('id').eq('company_id', companyId).eq('name', 'E2E Campaign').maybeSingle()
  if (!campaign) {
    const { data, error } = await admin.from('campaigns').insert({ company_id: companyId, name: 'E2E Campaign', sent_at: new Date().toISOString() }).select('id').single()
    if (error) throw new Error(`campaign: ${error.message}`)
    campaign = data
  }
  const campaignId = campaign.id

  // Assign the scanner to the campaign so /scan/campaigns shows it
  await admin.from('campaign_distributors').upsert({ campaign_id: campaignId, user_id: scanner.id }, { onConflict: 'campaign_id,user_id' })

  // Tokens: fresh, redeemed, and an RSVP'd one (covers verify + arrival states)
  await admin.from('gift_tokens').delete().eq('campaign_id', campaignId)
  const { error: tokErr } = await admin.from('gift_tokens').insert([
    { campaign_id: campaignId, employee_name: 'Fresh Token', phone_number: '+972500000001', redeemed: false },
    { campaign_id: campaignId, employee_name: 'Redeemed Token', phone_number: '+972500000002', redeemed: true, redeemed_at: new Date().toISOString() },
    { campaign_id: campaignId, employee_name: 'RSVP Token', phone_number: '+972500000003', redeemed: false, attending: true, attendee_count: 3 },
  ])
  if (tokErr) throw new Error(`tokens: ${tokErr.message}`)

  // Expose the fresh token's UUID so E2E can hit the public /gift/[token] page.
  const { data: freshTok } = await admin
    .from('gift_tokens')
    .select('token')
    .eq('campaign_id', campaignId)
    .eq('employee_name', 'Fresh Token')
    .single()

  // --- Arrival-certificate campaign → "confirm attendance" RSVP flow ---
  let { data: arrCampaign } = await admin.from('campaigns').select('id').eq('company_id', companyId).eq('name', 'E2E Arrival Campaign').maybeSingle()
  if (!arrCampaign) {
    const { data, error } = await admin.from('campaigns')
      .insert({ company_id: companyId, name: 'E2E Arrival Campaign', sent_at: new Date().toISOString(), supports_arrival_certificates: true, max_attendee_count: 5 })
      .select('id').single()
    if (error) throw new Error(`arrival campaign: ${error.message}`)
    arrCampaign = data
  }
  await admin.from('gift_tokens').delete().eq('campaign_id', arrCampaign.id)
  await admin.from('gift_tokens').insert({ campaign_id: arrCampaign.id, employee_name: 'Dana Cohen', phone_number: '+972500000010', redeemed: false })
  const { data: arrTok } = await admin.from('gift_tokens').select('token').eq('campaign_id', arrCampaign.id).single()

  // --- Multi-gift campaign → "choose your gift" flow ---
  let { data: giftCampaign } = await admin.from('campaigns').select('id').eq('company_id', companyId).eq('name', 'E2E Gift Choice Campaign').maybeSingle()
  if (!giftCampaign) {
    const { data, error } = await admin.from('campaigns')
      .insert({ company_id: companyId, name: 'E2E Gift Choice Campaign', sent_at: new Date().toISOString() })
      .select('id').single()
    if (error) throw new Error(`gift campaign: ${error.message}`)
    giftCampaign = data
  }
  await admin.from('campaign_gifts').delete().eq('campaign_id', giftCampaign.id)
  await admin.from('campaign_gifts').insert([
    { campaign_id: giftCampaign.id, name: 'Matcha tea set', position: 1 },
    { campaign_id: giftCampaign.id, name: 'Olive wood board', position: 2 },
    { campaign_id: giftCampaign.id, name: 'Dead Sea spa kit', position: 3 },
  ])
  await admin.from('gift_tokens').delete().eq('campaign_id', giftCampaign.id)
  await admin.from('gift_tokens').insert({ campaign_id: giftCampaign.id, employee_name: 'Avi Shapira', phone_number: '+972500000011', redeemed: false })
  const { data: giftTok } = await admin.from('gift_tokens').select('token').eq('campaign_id', giftCampaign.id).single()

  // --- Large campaign → pagination demo (130 tokens) ---
  let { data: bigCampaign } = await admin.from('campaigns').select('id').eq('company_id', companyId).eq('name', 'E2E Big Campaign').maybeSingle()
  if (!bigCampaign) {
    const { data, error } = await admin.from('campaigns')
      .insert({ company_id: companyId, name: 'E2E Big Campaign', sent_at: new Date().toISOString() })
      .select('id').single()
    if (error) throw new Error(`big campaign: ${error.message}`)
    bigCampaign = data
  }
  await admin.from('gift_tokens').delete().eq('campaign_id', bigCampaign.id)
  const DEPTS = ['Engineering', 'Sales', 'Design', 'People', 'Finance', 'Support']
  const bigRows = Array.from({ length: 1000 }, (_, i) => {
    const redeemed = i % 5 === 0
    return {
      campaign_id: bigCampaign.id,
      employee_name: `Employee ${String(i + 1).padStart(3, '0')}`,
      phone_number: `+97250${String(1000000 + i)}`,
      department: DEPTS[i % DEPTS.length],
      redeemed,
      redeemed_at: redeemed ? new Date().toISOString() : null,
    }
  })
  const { error: bigErr } = await admin.from('gift_tokens').insert(bigRows)
  if (bigErr) throw new Error(`big tokens: ${bigErr.message}`)

  // Populate scannable QR images on every non-redeemed token. In production the
  // send/dispatch pipeline generates these as PNGs in Supabase Storage; for the
  // local seed we inline a data-URL QR (encoding the same /verify/{token} URL)
  // so the gift page renders a real, scannable code without running dispatch.
  const allCampaignIds = [campaignId, arrCampaign.id, giftCampaign.id]
  const { data: allToks } = await admin.from('gift_tokens').select('id, token').in('campaign_id', allCampaignIds).eq('redeemed', false)
  for (const tk of allToks ?? []) {
    const dataUrl = await QRCode.toDataURL(`${APP_URL}/verify/${tk.token}`, { width: 400, margin: 2, errorCorrectionLevel: 'M' })
    await admin.from('gift_tokens').update({ qr_image_url: dataUrl }).eq('id', tk.id)
  }

  writeFileSync('e2e/.seed.json', JSON.stringify({
    companyId, campaignId,
    giftToken: freshTok?.token ?? null,
    arrivalToken: arrTok?.token ?? null,
    giftChoiceToken: giftTok?.token ?? null,
    bigCampaignId: bigCampaign.id,
  }, null, 2))

  console.log('✅ seeded:', JSON.stringify({ companyId, campaignId, users: E2E_USERS, password: E2E_PASSWORD }))
  console.log('   confirm-attendance: /gift/' + (arrTok?.token ?? '?'))
  console.log('   choose-gift:        /gift/' + (giftTok?.token ?? '?'))
  console.log('   big campaign (1000): /admin/campaigns/' + bigCampaign.id)
}

main().catch((e) => { console.error('❌ seed failed:', e.message); process.exit(1) })
