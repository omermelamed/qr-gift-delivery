# GiftFlow landing page — design spec

**Date:** 2026-07-05
**Status:** Approved by Omer (brainstorming session)

## Goal

Give GiftFlow its first public face: a marketing landing page at `/` that sells the
product to HR / People teams and captures leads via a contact form. Today `/` is a
bare redirect to `/login`; everything else is behind auth.

- **Audience:** HR buyers evaluating employee gift distribution tooling.
- **Primary CTA:** contact form ("book a demo / get in touch").
- **Languages:** English + Hebrew with the existing toggle; Hebrew renders RTL.
- **Success criteria:** page ships at `/`, leads land in Supabase (and in Omer's
  inbox when email is configured), existing users still reach `/login` in one click,
  lint/build/tests pass.

## Scope

One landing page (approach A). Explicitly **not** in scope: pricing page, blog,
self-serve signup, analytics tooling, CMS. The page can grow into a mini-site later
without rework.

## 1. Page content and structure

`src/app/page.tsx` becomes the landing page (the redirect to `/login` is removed).

Sections, top to bottom:

1. **Nav** — GiftFlow logo, EN/HE language toggle (reuse `src/lib/i18n`
   `LanguageContext` / `useT`), "Log in" button linking to `/login`.
2. **Hero** — outcome-focused headline (holiday gift distribution without
   spreadsheet chaos), sub-headline, CTA button that scrolls to the contact form,
   and a stylized CSS/SVG mockup of the live redemption dashboard. No real
   screenshots — mockups are hand-built so they stay current and work in both
   languages.
3. **How it works** — three steps mirroring the real flow:
   1. Upload your employee list (CSV).
   2. Every employee receives a personal QR code by SMS.
   3. Scan at the event; redemptions update live.
4. **Why GiftFlow** — feature grid: double-redemption protection (atomic
   validation), real-time dashboard, nothing for employees to install,
   Hebrew/English + RTL, per-campaign reporting.
5. **Contact form** — fields: name, company, work email, phone (optional),
   message (optional). Inline success and error states. Includes a hidden
   honeypot field.
6. **Footer** — logo, contact email, log-in link.

All copy exists in both languages via the existing translation files. Visual
design direction is decided at implementation time via the frontend-design skill.

## 2. Lead capture backend

- **Migration:** new `leads` table —
  `id uuid pk default gen_random_uuid()`, `created_at timestamptz default now()`,
  `name text not null`, `company text not null`, `email text not null`,
  `phone text`, `message text`, `locale text`, `status text default 'new'`.
  RLS enabled with **no anon policies**; only the service role reads/writes.
- **API route:** `POST /api/leads`
  - Validates all inputs server-side (required fields, email format, length caps).
  - Rejects submissions with a filled honeypot field (returns success-shaped
    response so bots learn nothing).
  - Applies the existing rate-limit helper (`src/lib/rate-limit.ts`) per IP.
  - Inserts the lead using the server-side service-role client.
  - If `RESEND_API_KEY` is set, sends a notification email to Omer with the lead
    details. Email failure is logged and never fails the request — the lead is
    always stored first.
- **Email provider:** Resend, behind the env var. No email is sent (and nothing
  breaks) until the key is configured.

## 3. What does not change

No changes to auth, middleware, RLS on existing tables, or any existing route.
Logged-in users hitting `/` see the marketing page and use the nav "Log in"
button; their session carries them through as today.

## 4. Error handling

- Client: field-level validation before submit; network/server errors show an
  inline retry message without losing typed input.
- Server: invalid payloads → 400 with a generic message (no field echo);
  rate-limited → 429; storage failure → 500 and the client shows the retry state.
- Email notification failures are logged server-side only.

## 5. Testing and validation

- Unit tests for `POST /api/leads`: happy path, validation failures, honeypot
  rejection, rate limiting, email-failure-still-stores behavior.
- Playwright e2e: fill and submit the form, assert the success state renders.
- `npm run lint` and `npm run build` pass.
- Manual check of both languages, including RTL layout in Hebrew.
