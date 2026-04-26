# Phase 1 — Setup & Core
**Timeline:** Week 1

## Goal
Establish the project foundation: database schema, authentication, QR generation API, and Vercel project scaffolding.

---

## Tasks

### 1.1 Vercel + Next.js Project Init
- [ ] Initialize Next.js app with TypeScript
- [ ] Connect to Vercel and configure project settings
- [ ] Set up environment variables (Supabase URL, anon key, service role key, Twilio credentials)
- [ ] Confirm successful deployment on Vercel preview URL

### 1.2 Supabase Project Setup
- [ ] Create new Supabase project
- [ ] Apply database schema:
  - [ ] `campaigns` table
  - [ ] `gift_tokens` table (with unique `token` UUID column)
- [ ] Configure Row-Level Security (RLS) policies per role (admin, distributor)
- [ ] Set up Supabase Auth (email/password for HR admin and distributor roles)

### 1.3 QR Generation API
- [ ] Install `qrcode` npm package
- [ ] Create Next.js API route: `POST /api/generate-qr`
  - Accepts `token` (UUID)
  - Returns QR code PNG buffer
- [ ] Store generated QR PNG in Supabase Storage (bucket: `qr-codes`)
- [ ] Return public URL of stored image

### 1.4 Basic Project Structure
- [ ] Set up folder structure: `app/`, `components/`, `lib/`, `types/`
- [ ] Configure Supabase client (server + browser clients)
- [ ] Add TypeScript types for `Campaign` and `GiftToken`

---

## Definition of Done
- Database schema is live in Supabase
- Auth works for admin and distributor logins
- QR generation API produces a valid PNG stored in Supabase Storage
- Next.js app deploys cleanly to Vercel
