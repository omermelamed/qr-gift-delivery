import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { rateLimit, clientIp } from '@/lib/rate-limit'

const MAX = { name: 120, company: 120, email: 254, phone: 32, message: 2000 }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Returns the trimmed string, or null when it isn't a string / exceeds max.
function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s.length > max ? null : s
}

export async function POST(request: NextRequest) {
  // Public, unauthenticated endpoint — rate-limit to curb form spam.
  const rl = rateLimit(`leads:${clientIp(request)}`, 5, 60_000)
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'too_many_requests' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfter) } }
    )
  }

  const body = await request.json().catch(() => ({}))

  // Honeypot: real users never see this field. Answer success-shaped so bots
  // learn nothing from the response.
  if (typeof body.website === 'string' && body.website.trim() !== '') {
    return NextResponse.json({ ok: true })
  }

  const name = str(body.name, MAX.name)
  const company = str(body.company, MAX.company)
  const email = str(body.email, MAX.email)
  const phone = str(body.phone ?? '', MAX.phone)
  const message = str(body.message ?? '', MAX.message)
  const locale = body.locale === 'he' ? 'he' : 'en'

  if (!name || !company || !email || phone === null || message === null || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: 'invalid_input' }, { status: 400 })
  }

  const service = createServiceClient()
  const { error } = await service.from('leads').insert({
    name,
    company,
    email,
    phone: phone || null,
    message: message || null,
    locale,
  })
  if (error) {
    console.error('leads insert failed:', error.message)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }

  // The lead is stored — notification failures must never fail the request.
  try {
    await notifyByEmail({ name, company, email, phone, message })
  } catch (e) {
    console.error('lead email notification failed:', e instanceof Error ? e.message : e)
  }

  return NextResponse.json({ ok: true })
}

async function notifyByEmail(lead: {
  name: string
  company: string
  email: string
  phone: string
  message: string
}) {
  const apiKey = process.env.RESEND_API_KEY
  const to = process.env.LEADS_NOTIFY_EMAIL
  if (!apiKey || !to) return

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: process.env.LEADS_FROM_EMAIL ?? 'GiftFlow <onboarding@resend.dev>',
      to: [to],
      subject: `New GiftFlow lead: ${lead.name} (${lead.company})`,
      text: [
        `Name: ${lead.name}`,
        `Company: ${lead.company}`,
        `Email: ${lead.email}`,
        lead.phone && `Phone: ${lead.phone}`,
        lead.message && `\n${lead.message}`,
      ]
        .filter(Boolean)
        .join('\n'),
    }),
  })
  if (!res.ok) throw new Error(`Resend responded ${res.status}`)
}
