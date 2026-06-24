# Per-Campaign SMS Template — Design

**Date:** 2026-06-24
**Status:** Approved, pending implementation plan

## Summary

Let each campaign optionally define its own SMS message, overriding the company-wide
default. When a campaign has no template of its own, sending falls back to the company
default (`companies.sms_template`, edited on the Settings page), and if that is also empty,
to the app's built-in default message. The per-campaign template is edited on the campaign
detail page and is only meaningful before the campaign is sent.

## Decisions (locked during brainstorming)

1. **Source:** free-text per campaign (not a picker from the `message_templates` library).
   Mirrors the existing `companies.sms_template` pattern.
2. **Placement:** the editor lives on the campaign detail page, in the pre-send config area
   (next to the Arrival Certificates toggle). Not added to the create form.
3. **Fallback order at send time:** `campaign.sms_template` → `companies.sms_template` →
   built-in default. The first non-empty value wins.
4. **Placeholders:** `{name}` and `{link}`, same as the company default. A non-empty
   template must contain `{link}` (mirrors the Settings validation in
   `src/app/api/settings/route.ts:38`).
5. **Editable pre-send only**, consistent with the campaign's other settings (the PATCH
   route's existing `sent_at` → 409 guard).

## Data model

New migration `supabase/migrations/<ts>_campaign_sms_template.sql`:

```sql
-- Optional per-campaign SMS override. NULL = use the company default
-- (companies.sms_template), and if that is null too, the built-in default.
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS sms_template TEXT;
```

- Nullable, no default; existing campaigns are unaffected.
- Add `sms_template: string | null` to the campaign type in `src/types/index.ts`.

## Shared rendering helper

New `src/lib/sms-template.ts`:

```ts
export function renderSmsTemplate(template: string, vars: { name: string; link: string }): string {
  return template
    .replaceAll('{name}', vars.name)
    .replaceAll('{link}', vars.link)
}
```

- Uses `replaceAll`. The current send/resend code uses `String.replace('{name}', …)`, which
  substitutes only the **first** occurrence — a latent bug if a template repeats `{name}`.
  Routing both paths through this helper fixes that while adding the override.
- This helper renders an already-chosen template string. The fallback chain (below) decides
  *which* template string to render; the built-in default remains `sendGiftSMS`'s own
  default body (used when no template string is chosen at all, i.e. effective template is
  null) — `renderSmsTemplate` is only called when there is a non-null template to render.

## Fallback resolution (send + resend)

Both `src/app/api/campaigns/[id]/send/route.ts` and
`src/app/api/campaigns/[id]/resend/route.ts`:

- Select `sms_template` on the campaign row (send already selects the campaign; resend
  selects tokens — it must also fetch `campaigns.sms_template` for the campaign).
- Compute `const effectiveTemplate = campaign.sms_template ?? company.sms_template ?? null`
  (treating empty/whitespace-only strings as absent — trim before the `??` chain).
- Per token: if `effectiveTemplate` is non-null, pass
  `body: renderSmsTemplate(effectiveTemplate, { name: employeeName, link: giftLink })`;
  otherwise pass `body: undefined` so `sendGiftSMS` uses its built-in default (current
  behaviour preserved).
- No change to credit reservation, batching, or QR generation.

## API — campaigns PATCH

Extend `PATCH /api/campaigns/[id]` (already a partial update accepting
`supportsArrivalCertificates` / `maxAttendeeCount`) to also accept `smsTemplate`:

- Field present and a non-empty string (after trim): must contain `{link}`, else
  `400 { error: 'invalid_template' }`; store the trimmed value in `sms_template`.
- Field present and `null` or empty/whitespace string: store `NULL` (revert to default).
- Field absent: unchanged.
- All existing guards hold: auth → `resolveCompanyId` → `campaigns:launch`, 404 if the
  campaign is not in the company, **409 if `sent_at` is set**.
- Audit metadata reflects the changed fields (the route already passes the built update
  object as metadata).

## UI — campaign detail page (pre-send only)

`src/app/admin/campaigns/[id]/page.tsx`: extend the campaign select to include
`sms_template`, and render a new editor in the draft/config area (the `isDraft` block where
`ArrivalCertToggle` lives). Pass the company default to the editor so it can be shown as the
placeholder (the page can fetch `companies.sms_template` alongside the campaign).

New client component `src/components/admin/CampaignSmsTemplate.tsx`:
- Props: `{ campaignId: string; initial: string | null; companyDefault: string | null }`.
- A `<textarea>` initialised from `initial`, with `placeholder` set to `companyDefault`
  (or, if that is also empty, a hint that the built-in default will be used).
- Helper text: lists the `{name}` / `{link}` placeholders and "Leave empty to use the
  default from Settings."
- Save via `PATCH /api/campaigns/[id]` with `{ smsTemplate }` (Save button; optimistic with
  revert on failure, matching the toggle pattern). On client side, if non-empty and missing
  `{link}`, show an inline error and do not send (the API still enforces).
- Only rendered when the campaign is unsent (the config area is already pre-send only).

## i18n

Add Hebrew strings to `src/lib/i18n/translations.he.ts`: the editor label
("SMS message"), the helper text, the placeholders hint, "Leave empty to use the default
from Settings.", and the "must contain {link}" error.

## Testing

- `tests/lib/sms-template.test.ts` (new): `renderSmsTemplate` substitutes both vars,
  handles repeated `{name}` (asserts the replaceAll fix), and leaves text without
  placeholders unchanged.
- `tests/api/campaign-patch.test.ts` (extend): `smsTemplate` with `{link}` persists; missing
  `{link}` → `400 invalid_template`; empty/`null` stores `NULL`; partial body with only
  `smsTemplate` works; the `sent_at` 409 guard still holds.
- `tests/api/send.test.ts` and `tests/api/resend.test.ts` (extend if their existing mock
  chains allow): campaign override is used when set; falls back to company default when the
  campaign template is null. (These suites currently have a pre-existing mock-chaining
  baseline failure; if the new assertions can't be expressed without first repairing that
  baseline, cover the resolution logic via the helper/unit level and note the gap.)
- The textarea editor is UI (no unit test, consistent with the toggle/cells).

## Out of scope

- Wiring the `message_templates` library into campaigns (separate system).
- A send-time preview / test-send.
- Per-recipient personalization beyond `{name}` / `{link}`.
- Adding the editor to the create form.
