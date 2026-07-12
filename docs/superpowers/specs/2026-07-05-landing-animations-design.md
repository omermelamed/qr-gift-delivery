# Landing page animations — design spec

**Date:** 2026-07-05
**Status:** Approved by Omer (brainstorming session)
**Extends:** `2026-07-05-landing-page-design.md`, implemented on `feat/landing-page`

## Goal

Add restrained, orchestrated motion to the landing page: one hero entrance
moment, a live-counter tick-up, scroll reveals for below-the-fold sections, and
hover micro-interactions. No new dependencies. Reduced-motion users get the
current static page.

## 1. Hero load sequence (CSS only)

A `rise-in` keyframe in `globals.css` (opacity 0→1, translateY 14px→0, ~600ms,
ease-out, `both` fill). Staggered delays:

- Eyebrow 0ms, headline 80ms, paragraph 160ms, CTA row 240ms.
- Phone mockup rises alongside (~200ms delay).
- Dashboard card lands last (~450ms) with a scale pop (0.92→1).

Applied via utility classes (`.rise`, `.rise-d1`…`.rise-d4`, `.pop`); runs once
on page load.

## 2. Counter tick-up

The dashboard card's "312" server-renders as the final value (no flash without
JS). After hydration, if motion is allowed, it animates 0→312 over ~1.2s using
requestAnimationFrame with ease-out cubic. Lives in `HeroMockup.tsx` as a small
`CountUp` component; checks `matchMedia('(prefers-reduced-motion: reduce)')`
and renders the static value when reduced.

## 3. Scroll reveals

New `src/components/landing/Reveal.tsx` (~30 lines, client): wraps a block,
IntersectionObserver flips `data-shown="true"` at ~15% visibility, then
disconnects (one-shot). CSS in `globals.css` handles the transition
(opacity/translateY only — layout size never changes, so SEO crawlers and
Playwright see full content). Optional `delay` prop sets `transitionDelay` for
sibling stagger:

- Step cards: 0/100/200ms. Feature items: index × 50ms. Contact columns: 0/100ms.
- Section headings (eyebrow + h2) reveal as one block, no delay.

If IntersectionObserver is unavailable, content shows immediately.

## 4. Hover micro-interactions

- Step cards: 2px lift + deeper shadow on hover (transition-only).
- Primary CTA buttons (nav, hero, form submit): existing opacity/color hovers
  gain a subtle `-translate-y-px` lift.

## 5. Reduced motion

All new motion is inert under `prefers-reduced-motion: reduce`:

- `rise-in` / pop keyframes and reveal transitions are defined inside
  `@media (prefers-reduced-motion: no-preference)` — reduced users get static,
  fully visible content (base styles never hide anything).
- `CountUp` checks the media query and renders the final value.
- Existing scan-line/ping animations already carry `motion-reduce:hidden`.

## Out of scope

No animation library, no scroll-linked (parallax/progress) effects, no motion
on admin/app pages, no changes to copy, layout, or the API.

## Validation

- Existing vitest suite and `e2e/landing.spec.ts` still pass (content and
  labels unchanged; reveals never remove elements from layout).
- `npm run build` passes.
- Fresh EN/HE/mobile screenshots look correct.
- A screenshot with reduced motion emulated shows the full static page (no
  stuck-invisible sections).
