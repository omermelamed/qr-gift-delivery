# Campaign creation wizard — design

**Date:** 2026-07-01
**Status:** Approved (design)

## Objective

Turn campaign setup into a guided, step-by-step wizard. Today creation collects
only name + date, then the campaign detail page (in draft mode) is a bento grid
where the admin adds employees, assigns distributors, sets gifts, edits the SMS
message, toggles arrival certificates, and finally launches. We replace that
draft experience with sequential cards that lead the admin through all relevant
data, with clear Next/Back navigation and explicit required-vs-optional gating.

## Decisions (locked with the user)

- **5 grouped steps.**
- **Wizard replaces the draft view.** A draft campaign (no `sent_at`) opens the
  wizard. A launched campaign renders the existing live dashboard **unchanged**.
- **Stepper + Next/Back.** Clickable progress stepper plus Next/Back buttons;
  the user may jump to any already-satisfied step or move linearly.
- **Gate Next per step.** Next is disabled until the current step's hard
  requirement is met. Optional steps never block.
- **Arrival certificates live under "Advanced settings"** inside the Message step.
- **Incomplete campaigns stay as drafts in the campaign list (as today).**
  Re-entering a draft resumes at the last step the user was on.

## Required vs optional

- **Mandatory:** campaign name, campaign date, at least one employee. These are
  the hard requirements to launch.
- **Optional:** distributors, gift options, per-campaign SMS template, arrival
  certificates + max attendees.

## The 5 steps

1. **Basics** — campaign name + date. Editable in place (text input +
   `DatePicker`). *Gate: name + date required to advance.*
2. **Employees** — existing `CampaignPopulator` (upload / directory / clone) +
   `EmployeeTable`. *Gate: ≥1 employee token to advance.*
3. **Distribution** — `DistributorAssignment` + `GiftOptionsEditor`. Optional;
   Next always enabled.
4. **Message** — `CampaignSmsTemplate`, plus a collapsible **"Advanced settings"**
   section containing `ArrivalCertToggle` (arrival certificates + max attendees).
   Optional.
5. **Review & Launch** — read-only summary (name, date, # employees,
   # distributors, gift options, arrival on/off) and the existing `LaunchButton`.
   Lists any unmet hard requirement so the user knows what's missing.

Every step body **reuses an existing component**. No step rewrites the underlying
data-fetching or mutation logic.

## Architecture

- **`/admin/campaigns/new`** stays as **Step 1 only** (name + date). On submit it
  creates the draft via the existing `POST /api/campaigns` and redirects to
  `/admin/campaigns/[id]`. This is required because every later step needs a
  campaign id to attach data to.
- **Draft detail page** (`/admin/campaigns/[id]`) renders a new client component
  **`<CampaignWizard>`** in place of the current draft bento grid. When
  `sent_at` is set, the page renders the existing live dashboard unchanged.
- **`<CampaignWizard>`** owns: current step, the stepper UI, Next/Back buttons,
  and per-step gating. It receives the campaign, tokens, gifts, employees, credit
  balance, etc. as props from the server component (same data the page already
  loads) and renders the existing components as step bodies.

## Resume (last step)

- **Persist last step in the DB** — source of truth, so resume works across
  devices/sessions, not just one browser.
- Add column `campaigns.wizard_last_step smallint not null default 1`
  (migration-tracked).
- The wizard's initial step = URL `?step=` if present, else
  `campaign.wizard_last_step`, clamped to 1–5.
- On every step change the wizard updates the `?step=` URL param **and**
  fires a fire-and-forget PATCH to persist `wizardLastStep`.

## Backend changes

Extend `PATCH /api/campaigns/[id]` (currently handles only
`supportsArrivalCertificates`, `maxAttendeeCount`, `smsTemplate`) to also accept:

- `name` — non-empty string, trimmed (same rule as POST).
- `campaignDate` — valid date string (same rule as POST).
- `wizardLastStep` — integer 1–5.

The route already restricts updates to draft campaigns (rejects rows with
`sent_at`) and checks the `campaigns:launch` permission — both behaviors are kept.

## State & refresh

- `CampaignWizard` is a client component; server data flows in as props (the page
  already fetches tokens, gifts, employees, credits).
- Existing components call `router.refresh()` after mutations (employee upload,
  distributor changes, etc.). Because the current step lives in the `?step=` URL
  param, a refresh preserves the user's place. The employee-count gate re-reads
  the refreshed token data from props.

## Data flow (create → launch)

1. `/new` → POST creates draft → redirect to `/admin/campaigns/[id]?step=2`.
2. Wizard step changes → URL `?step=` update + PATCH `wizardLastStep`.
3. Step bodies mutate through their existing API routes (tokens, distributors,
   gifts, sms template, arrival toggle) — unchanged.
4. Step 5 Launch uses the existing `LaunchButton` / send flow — unchanged.
5. After launch, `sent_at` is set → detail page renders the live dashboard.

## Error handling

- Step 1 create errors surface inline as today.
- PATCH persistence of `wizardLastStep` is fire-and-forget; a failed persist only
  costs the resume position (falls back to `?step=` / default), never blocks
  navigation or data.
- Hard-requirement gating prevents launching an under-configured campaign; the
  Review step enumerates anything still missing.

## Out of scope

- No change to the launched/live dashboard layout.
- No change to the campaign list page (drafts already appear there).
- No change to the underlying employee/distributor/gift/SMS APIs beyond the PATCH
  extension above.

## Validation to run after

- `tsc` + lint.
- Manual walk-through:
  - New campaign → Step 1 gate (name+date) → Step 2 gate (≥1 employee) →
    optional steps → Review → Launch.
  - Abandon mid-wizard, return via campaign list → resumes at last step.
  - Reopen a launched campaign → live dashboard renders unchanged.
  - Edit name/date on a revisited draft → persists via PATCH.
