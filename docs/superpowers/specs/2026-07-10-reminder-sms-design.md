# Reminder SMS — Design

**Date:** 2026-07-10
**Status:** Approved, pending implementation plan

## Summary

Let each campaign optionally define a distinct reminder SMS message, independent from the
primary message, sent by the existing "Send reminder" action (`resend/route.ts`) to
employees who haven't redeemed yet. When no reminder message is set, sending falls back
dynamically to whatever the effective primary message is (campaign override → company
default → built-in default). The reminder message is edited inside a new "Reminder SMS"
collapsible in the campaign creation wizard's Message step (styled like the existing
"Advanced settings" section), and remains editable after the campaign launches via a new
card on the campaign detail page — unlike every other campaign field, which freezes once
`sent_at` is set.

## Decisions (locked during brainstorming)

1. **Trigger:** no new send mechanism. The existing "Send reminder" button / `resend`
   route is the only thing that sends the reminder message — this feature only changes
   *what text* it sends.
2. **Templating:** same `{name}`/`{link}` placeholders, same `renderSmsTemplate` pipeline,
   same "must contain `{link}`" validation as the primary message.
3. **Schema:** a single nullable column (`reminder_sms_template`), mirroring the existing
   `sms_template` column — not a separate `message_templates` table. No other message
   types exist or are planned; a normalized table is unwarranted complexity.
4. **Fallback:** dynamic, not a snapshot. `NULL` means "use the effective primary message
   at send time," computed the same way `sms_template`'s own fallback already works
   (`resolveSmsTemplate`), one level deeper.
5. **Post-launch editing:** a new dedicated route, `PATCH /api/campaigns/[id]/reminder-template`,
   is **not** gated by `sent_at`. It is the one deliberate exception to "campaigns are
   frozen after launch" (`PATCH /api/campaigns/[id]` returns 409 for every other field once
   sent). This route is used for both pre-launch (wizard) and post-launch (detail page)
   edits — one endpoint, one validation path, no duplication between wizard and detail page.
6. **Placement:** wizard gets a new collapsible section, sibling to "Advanced settings" (not
   nested inside it), inside Step 4 (Message). The detail page gets its own card, separate
   from the "Send reminder" button/kebab menu.

## Data model

New migration `supabase/migrations/<ts>_campaign_reminder_sms_template.sql`:

```sql
-- Optional per-campaign reminder SMS override. NULL = use the effective primary
-- message (campaign.sms_template -> companies.sms_template -> built-in default).
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS reminder_sms_template TEXT;
```

- Nullable, no default; existing campaigns are unaffected.
- Add `reminder_sms_template: string | null` to the campaign type in `src/types/index.ts`
  and to `CampaignWizard.tsx`'s own inline `campaign` prop type (it currently redeclares
  `sms_template: string | null` locally rather than importing the shared type).

## Resolution helper

Extend `src/lib/sms-template.ts`:

```ts
/**
 * Picks the effective reminder template: reminder override if non-empty, else
 * whatever resolveSmsTemplate would pick for the primary message. Trims, treats
 * whitespace-only as absent.
 */
export function resolveReminderTemplate(
  reminderTemplate: string | null,
  campaignTemplate: string | null,
  companyTemplate: string | null,
): string | null {
  const rem = reminderTemplate?.trim()
  if (rem) return rem
  return resolveSmsTemplate(campaignTemplate, companyTemplate)
}
```

Composes with the existing `resolveSmsTemplate` instead of duplicating its precedence
logic. Returns `null` when nothing is set anywhere, same contract as `resolveSmsTemplate`
— caller (`planTokenMessages`) already treats `null` as "use the built-in default body."

## Fallback resolution (resend route)

`src/app/api/campaigns/[id]/resend/route.ts`:

- Extend the campaign select (line 36) to also fetch `reminder_sms_template`.
- Replace the `effectiveTemplate` computation (line 49):
  ```ts
  const effectiveTemplate = resolveReminderTemplate(
    campaign.reminder_sms_template,
    campaign.sms_template,
    company?.sms_template ?? null,
  )
  ```
- No other change to this route — batching, audit logging (`campaign.reminder_sent`), and
  per-token dispatch via `planTokenMessages` are untouched.
- `send/route.ts` (the initial blast) is **not** touched — it must keep using
  `resolveSmsTemplate`/`campaign.sms_template`, since the reminder message only applies to
  the reminder send path.

## API — new reminder-template route

New `src/app/api/campaigns/[id]/reminder-template/route.ts`, `PATCH`:

- Auth: same pattern as the other campaign routes — session user → `resolveCompanyId` →
  `hasPermission(permissions, 'campaigns:launch')` → 403 if missing.
- Body: `{ reminderSmsTemplate: string | null }`.
  - `null` or empty/whitespace string → store `NULL`.
  - Non-empty string missing `{link}` → `400 { error: 'invalid_template' }`.
  - Non-empty string containing `{link}` → store trimmed value.
  - Field absent → `400 { error: 'reminderSmsTemplate is required' }` (this route only
    does one thing, unlike the generic partial-update PATCH).
- Fetch campaign scoped to `id` + `company_id`; `404` if not found. **No `sent_at` check.**
- `UPDATE campaigns SET reminder_sms_template = ...` via the service client.
- Audit: `logAuditEvent` with a new action `campaign.reminder_template_updated`, metadata
  `{ reminderSmsTemplate }` (add this action to the `AuditAction` union in
  `src/lib/audit.ts` and to `AuditLogTable.tsx`'s rendering, same as other actions).

## UI — wizard (Step 4, pre-launch)

`src/components/admin/wizard/CampaignWizard.tsx`: add a second collapsible, directly below
the existing "Advanced settings" block (same visual pattern — toggle button, chevron,
`useState`), titled **"Reminder SMS"**:

```tsx
<div className="rounded-xl border border-zinc-200">
  <button type="button" onClick={() => setReminderOpen((o) => !o)}
    className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-zinc-700"
    aria-expanded={reminderOpen}>
    <span>{t('Reminder SMS')}</span>
    <span className={`transition-transform ${reminderOpen ? 'rotate-180' : ''}`}>⌄</span>
  </button>
  {reminderOpen && (
    <div className="px-4 pb-4">
      <ReminderSmsTemplate
        campaignId={campaign.id}
        initial={campaign.reminder_sms_template}
        effectivePrimaryTemplate={effectivePrimaryTemplate}
      />
    </div>
  )}
</div>
```

`const [reminderOpen, setReminderOpen] = useState(!!campaign.reminder_sms_template)` —
defaults open only if a reminder override already exists, mirroring the `advancedOpen`
pattern. `effectivePrimaryTemplate` is computed the same way the page already computes
`companyDefaultTemplate` for `CampaignSmsTemplate` — pass
`resolveSmsTemplate(campaign.sms_template, companyDefaultTemplate)` down from the page/wizard
props so the reminder editor can show what "leave blank" actually resolves to right now.

## UI — new shared component

New `src/components/admin/ReminderSmsTemplate.tsx`, modeled directly on
`CampaignSmsTemplate.tsx` (same textarea + `SmsLengthHint` + save button shape), with two
differences:

- Saves via `PATCH /api/campaigns/${campaignId}/reminder-template` with
  `{ reminderSmsTemplate: trimmed === '' ? null : trimmed }` (not the generic campaigns
  PATCH — this is what makes it work identically pre- and post-launch).
- Placeholder/helper text reflects the fallback: if `effectivePrimaryTemplate` is
  non-null, use it as the placeholder with helper text `t('Leave empty to use the primary message.')`;
  if `null` (built-in default applies), show
  `t('Leave empty to use the default reminder text.')`.

Used in two places:
1. Wizard Step 4, inside the new "Reminder SMS" collapsible (above).
2. Campaign detail page, in a new standalone card (see below).

## UI — campaign detail page (post-launch)

`src/app/admin/campaigns/[id]/page.tsx`: extend the campaign select to include
`reminder_sms_template`, compute `effectivePrimaryTemplate` the same way. Render a new card
**outside** the `isDraft` gate (so it shows both pre- and post-launch) and separate from the
`ReminderButton`/kebab menu area:

```tsx
<div className="bg-white rounded-2xl border border-zinc-200 p-4">
  <span className="text-sm font-semibold text-zinc-900">{t('Reminder message')}</span>
  <ReminderSmsTemplate
    campaignId={campaign.id}
    initial={campaign.reminder_sms_template}
    effectivePrimaryTemplate={effectivePrimaryTemplate}
  />
</div>
```

Since `ReminderSmsTemplate` always hits the sent_at-agnostic route, no launch-state branching
is needed in this card — it behaves identically before and after `sent_at` is set.

## i18n

Add Hebrew strings to `src/lib/i18n/translations.he.ts` under a new `// Reminder SMS`
comment block: `'Reminder SMS'`, `'Reminder message'`, `'Leave empty to use the primary
message.'`, `'Leave empty to use the default reminder text.'`. The `'The message must
contain {link}.'` and `'Could not save. Please try again.'` strings are already translated
(reused from `CampaignSmsTemplate`).

## Error handling

- Reminder route validation mirrors the primary template's validation exactly (trim,
  `{link}` requirement) — no new rules, no duplicated logic beyond the necessary route
  boilerplate (auth chain is identical across all campaign routes).
- The 409 "campaign already sent" guard on the generic `PATCH /api/campaigns/[id]` is
  untouched for every other field. The new route is the only place a launched campaign can
  still be mutated, and it only ever touches `reminder_sms_template`.
- If the reminder send (`resend` route) fires while `reminder_sms_template` and
  `sms_template` and the company default are all null, behavior is unchanged from today:
  `planTokenMessages` falls back to the built-in default body.

## Testing

- `tests/lib/sms-template.test.ts` (extend): `resolveReminderTemplate` — reminder override
  wins when set; falls through to campaign template; falls through to company template;
  null when nothing set; whitespace-only reminder treated as absent.
- `tests/api/campaign-reminder-template.test.ts` (new): valid `{link}`-containing template
  persists; missing `{link}` → `400 invalid_template`; `null`/empty stores `NULL`; works
  identically when `campaign.sent_at` is set vs unset (the key behavioral difference from
  the generic PATCH route); 404 for a campaign in another company; 403 without
  `campaigns:launch` permission.
- `tests/api/resend.test.ts` (extend, same caveat as the sms-template precedent if the
  mock-chaining baseline is broken): reminder override is used when set; falls back to the
  effective primary template when the reminder is null.
- The textarea editor (`ReminderSmsTemplate`) is UI — no unit test, consistent with
  `CampaignSmsTemplate`.

## Out of scope

- Any new send trigger, schedule, or cron for reminders — `resend` stays manual/admin-triggered.
- A send-time preview / test-send for the reminder message.
- Editing the reminder message from anywhere other than the wizard and the detail-page card
  (e.g. no bulk edit across campaigns).
- Changes to `send/route.ts` (the initial blast) — it is unaffected by this feature.
