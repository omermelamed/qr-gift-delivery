# GiftFlow — Company-wide analytics page

**Date:** 2026-07-12
**Status:** Approved by Omer (brainstorming session)

## Goal

Add a new `/admin/analytics` page giving HR admins a cross-campaign view of how
their gift days are performing. Today `/admin` shows a per-campaign stats bar
and each campaign detail page has its own numeric breakdowns (redemption %,
department table, distributor table) — none of that compares *across*
campaigns or shows trends over time. This page is scoped to that gap only. A
deeper per-campaign analytics pass (real charts on the campaign detail page
itself) is an explicit non-goal here — a candidate for a future sub-project,
not part of this one.

## 1. Charts

Four charts, each backed by data that already exists (no schema changes):

1. **Redemption rate per campaign** — bar chart, one bar per filtered
   campaign, % redeemed, sorted by campaign date (most recent first).
2. **Campaign volume over time** — bar chart, campaigns launched per month,
   bucketed from whatever months are present in the filtered set (no padding
   of empty months for v1).
3. **Department engagement** — bar chart, redemption rate per
   `gift_tokens.department`, aggregated across every token in the filtered
   campaigns, sorted by rate descending.
4. **RSVP vs. actual redemption** — grouped bars, one row per filtered
   campaign, "confirmed attending" (`attending = true`) vs. "actually
   redeemed" (`redeemed = true`) counts. Only includes campaigns that have at
   least one token with `attending IS NOT NULL` (i.e. campaigns that used
   arrival certificates) — campaigns without that feature are silently
   excluded from this chart only, with an explanatory empty state if it
   leaves zero campaigns.

A fifth chart ("redemptions over time within an event," hours-since-SMS
aggregated across campaigns) was designed and explicitly cut as redundant
with #1 — not deferred, cut.

Chart-type switching (bar → line → other) was considered and explicitly
rejected — each chart keeps a fixed, purpose-built visualization.

## 2. Filters

Three filters, shared across all four charts:

- **Date range** — preset buckets (All time / Last month / Last 3 months /
  This year), not an arbitrary from–to date picker. Filters on
  `campaign_date`, falling back to `sent_at` then `created_at` for campaigns
  missing a set event date. (The working mockup used presets for both
  filters below too, for demo simplicity — call that out explicitly since it
  otherwise reads as ambiguous: presets are the real design for date range,
  but campaign name below is real free-text search, not a preset list.)
- **Campaign name** — free-text, case-insensitive substring match against the
  campaign name. The mockup used a dropdown of campaign names instead, purely
  because building live text search into a static demo wasn't worth the
  effort — a dropdown enumerating every campaign doesn't scale as a company
  runs more gift days, so the real implementation is a search input.
- **Status** — Draft / Active / Closed, derived exactly like the existing
  campaigns list: draft = no `sent_at`, active = `sent_at` set and no
  `closed_at`, closed = `closed_at` set.

**Sync toggle**, switch at the top of the page, defaults on:

- **Synced (default):** one filter bar at the top of the page controls every
  chart. Per-chart filter rows are hidden entirely while synced — showing the
  same three controls five times over would be redundant.
- **Independent:** the top bar hides; each chart card grows its own filter
  row (pinned to the bottom of the card via flex layout, not just trailing
  whatever content happens to be above it) so each chart can show a different
  slice — e.g. one campaign's rate next to another's department breakdown.
- Toggling back to synced snaps every chart to the last global filter values,
  discarding any per-chart divergence.

Filter state lives in client component state, not URL search params — the
per-chart-divergence case doesn't map cleanly to shareable URLs, and nothing
here needs to be linkable/bookmarkable for v1.

## 3. Architecture

`src/app/admin/analytics/page.tsx` — Server Component. Same auth pattern as
every other `/admin/*` page: `createClient()` session check → redirect to
`/login` if absent → `resolveCompanyId(appMeta)` → `createServiceClient()` for
the actual reads, scoped with `.eq('company_id', companyId)` (this codebase's
established pattern for admin pages — service-role client with manual
company-scoping, not a session-bound RLS query). Fetches the company's full
`campaigns` (`id, name, campaign_date, sent_at, closed_at`) and `gift_tokens`
(`campaign_id, redeemed, redeemed_at, sms_sent_at, department, attending`)
once, unfiltered, and passes both arrays as props into a client component.

`src/components/admin/analytics/AnalyticsUI.tsx` — `'use client'`, owns the
sync toggle and filter state (global + per-chart), renders the global filter
bar or delegates filter rows to each `ChartCard`, and — for every chart —
applies the active filter to the raw campaigns, then calls that chart's
aggregation function to produce its data array before handing it to the
Recharts component.

`src/components/admin/analytics/ChartCard.tsx` — shared card shell (title,
subtitle, chart slot, conditional filter row), matching the existing `.card`
visual language.

Four chart components (`RedemptionRateChart`, `CampaignVolumeChart`,
`DepartmentEngagementChart`, `RsvpVsRedemptionChart`), each a thin Recharts
wrapper taking a plain data array as props — no data-fetching or filtering
logic of their own.

`src/lib/analytics/filterCampaigns.ts` and `src/lib/analytics/aggregate.ts` —
plain, framework-free functions: one applies `{dateRange, campaignName,
status}` to the raw campaign list, the other four (one per chart) turn
filtered campaigns + tokens into that chart's data array. Kept separate from
the React components specifically so they're unit-testable in isolation.

A new **Analytics** entry is added to the admin sidebar
(`src/components/admin/Sidebar.tsx`), alongside Campaigns / Team / Settings /
Audit Log.

**Charting library:** Recharts (new dependency). **Aggregation:** client-side
JS over the full unfiltered dataset fetched once — at realistic data volumes
(dozens of campaigns, hundreds of tokens each) this is trivial, and it means
changing a filter never needs a network round-trip.

## 4. Error handling & empty states

- Server-side fetch failure: surface an explicit error message on the page,
  not a silently empty chart grid — matches this codebase's existing
  preference (campaigns list already does this) over failing silently.
- Company has zero campaigns at all: a single page-level empty state instead
  of four empty chart cards.
- Filters produce zero matching campaigns for a given chart: that chart shows
  its own "no campaigns match these filters" message; the other charts (in
  independent mode) are unaffected.
- RSVP chart with zero arrival-certificate campaigns in range: its own
  explanatory empty state, distinct from the generic "no matches" one.

## 5. Known limitation

Recharts doesn't auto-mirror for RTL. For v1, charts render left-to-right
regardless of locale (Hebrew labels/text still translate normally; only the
chart geometry itself doesn't flip). Flagged here as a scoped-out limitation,
not an oversight.

## 6. Testing

- Unit tests (Vitest, matching `tests/api/*.test.ts` convention) for
  `filterCampaigns` and each of the four aggregation functions — pure
  functions, the highest-value and cheapest thing to test here.
- `npm run lint` / `npm run build` clean.
- Manual check in both locales (EN/HE) for the filter bar, sync toggle, and
  all four charts' empty/populated states.
