# QR Gift Delivery System

One-time QR code gift delivery and confirmation platform for ~2,000 employees per holiday campaign.

**Stack:** Next.js (App Router) · Supabase (Postgres + Auth + Storage + Realtime) · Twilio MMS · Vercel

## Purpose

HR admins create campaigns, upload employee CSVs, and launch bulk MMS delivery of personalized QR codes. Field distributors scan codes on mobile to confirm physical gift handoff. HR monitors redemptions live.

## Core operating rules

- treat token idempotency as a hard invariant — a QR code must never be redeemable twice
- Supabase is the source of truth for all redemption state; never compute redemption status client-side
- keep token validation fast and atomic; the verify endpoint is on the critical distributor path
- HR admin routes require auth; distributor scan route requires auth; employee-facing QR landing page is public
- Row-Level Security enforces role separation — never bypass RLS with service-role key in client code
- build in phases; phase 1 and 2 must work before the admin dashboard is layered on top
- before non-trivial edits, state the plan, touched files, and checks to run
- after edits, run the smallest relevant validation and report exact results
- never claim code or tests ran unless they actually ran

## Engineering posture

- keep business logic in API routes and server actions, not in client components
- prefer explicit data flow over implicit hooks chaining into hooks
- keep files small enough that each one has one clear owner
- avoid abstractions before duplication is real and painful
- use consistent naming across layers: `campaign`, `gift_token`, `token`, `redeemed`

## Reasoning and token discipline

- load only the smallest relevant context for the current task
- reuse context files in `.claude/context/` rather than repeating product facts
- summarize intent first, then inspect only the touched layer

## Default workflow

1. restate the task in domain language
2. identify the smallest set of files that should change
3. inspect the relevant context and skill files
4. implement the smallest coherent diff
5. run focused validation
6. report what changed, what ran, and any follow-up risk

## Load context package

@.claude/context/domain.md

## Rule notes

- path-scoped rules live in `.claude/rules/`
- agents for layer-specific implementation are in `.claude/agents/`
- skills for repeatable workflows are in `.claude/skills/`
