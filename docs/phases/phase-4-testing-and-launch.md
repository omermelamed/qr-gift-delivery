# Phase 4 — Testing & Launch
**Timeline:** Week 4

## Goal
Validate the full system end-to-end, load test at scale, run HR UAT, and deploy to production.

---

## Tasks

### 4.1 End-to-End Testing
- [ ] Manual E2E walkthrough:
  - [ ] Admin creates campaign → uploads CSV → launches
  - [ ] Verify all tokens created in DB
  - [ ] Confirm MMS received with correct QR image
  - [ ] Distributor scans valid QR → sees ✅ + employee name
  - [ ] Scanning same QR again → sees ❌ already claimed
  - [ ] HR dashboard reflects correct claimed count in real time
  - [ ] CSV export contains correct data
- [ ] Test edge cases:
  - [ ] Invalid/garbage QR token
  - [ ] Employee with invalid phone number in CSV
  - [ ] Resend SMS to a specific employee

### 4.2 Load Testing
- [ ] Simulate bulk insert of 2,000 `gift_tokens` rows
- [ ] Run SMS blast to test numbers (use Twilio test credentials or a small real batch)
- [ ] Measure time to complete 2,000 MMS sends (target: under 10 minutes)
- [ ] Simulate concurrent QR scans and verify no duplicate redemptions occur
- [ ] Confirm QR verification API responds under 1 second under load

### 4.3 Security Review
- [ ] Verify RLS policies block cross-role data access in Supabase
- [ ] Confirm admin routes redirect unauthenticated users to login
- [ ] Confirm distributor scan page blocks non-distributor roles
- [ ] Verify tokens are UUID-based (unguessable) and not sequential

### 4.4 HR Team UAT
- [ ] Walk HR admin through full campaign flow
- [ ] Collect feedback and fix any UX issues
- [ ] Confirm export CSV format meets HR's needs
- [ ] Sign-off from HR stakeholder

### 4.5 Production Deploy
- [ ] Set all production environment variables in Vercel
- [ ] Point Twilio sender to production phone number
- [ ] Enable Supabase production project (confirm free-tier limits are sufficient)
- [ ] Run smoke test on production URL
- [ ] Share production URL + distributor login credentials with field team

---

## Definition of Done
- All E2E scenarios pass manually
- Load test confirms 2,000 SMS sends complete within 10 minutes
- Zero duplicate redemptions under concurrent scan test
- HR team has signed off
- System is live on production Vercel URL
