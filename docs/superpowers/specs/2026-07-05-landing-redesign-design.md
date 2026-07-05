# Landing page redesign (ui-ux-pro-max pass) — design spec

**Date:** 2026-07-05
**Status:** Approved by Omer
**Extends:** `2026-07-05-landing-page-design.md`, `2026-07-05-landing-animations-design.md`

## Goal

Richer motion and micro-detail across the landing page, guided by the
ui-ux-pro-max skill (scroll-storytelling pattern, stat counters, SVG icons,
150–300ms micro-interactions, no infinite decorative loops). **Brand is kept**:
indigo `#6366f1`, Space Grotesk/Inter/Heebo — the skill's palette/font
suggestion (sky blue / Plus Jakarta Sans) was rejected for product consistency.
No copy rewrites, no API/schema changes, no new dependencies. Existing e2e must
keep passing unchanged.

## 1. Hero choreography (~3s, once on load)

Replaces the current simple stagger inside the phone:

1. Existing text/CTA stagger unchanged; phone rises as today.
2. In the SMS bubble: typing dots appear (~0.5s), pulse 3×, fade (~1.6s).
3. Message text + QR fade in (~1.6s); the scan-line sweeps **twice** then fades
   out (finite `scan-sweep` keyframe replaces the infinite sweep on this page).
4. Dashboard card pops at ~2.1s; counter counts 0→312 from ~2.2s; the progress
   bar fills via `scaleX` (RTL-aware transform-origin).
5. A small "Redeemed" toast pill (SVG check + text) rises on the card at ~3.4s.
6. Soft radial indigo glow behind the hero (static, `-z-10`).

Bubble reserves full size from the start (dots overlay, no layout jump).

## 2. Nav upgrades → `LandingNav.tsx`

Nav extracted from `LandingPage` into its own client component:

- **Scroll progress bar**: 2px brand bar along the header's bottom edge,
  `scaleX` driven by rAF-throttled scroll (`origin-left rtl:origin-right`).
- **Scrollspy**: IntersectionObserver (rootMargin −40%/−55%) highlights the
  active section link (`how-it-works`, `why`, `contact`).
- **Scroll shadow**: header gains a shadow once `scrollY > 8`.
- **Smooth anchors**: `html { scroll-behavior: smooth }` (inside the
  reduced-motion gate) + `scroll-mt-16` on the three sections.

`QrMark`/`Eyebrow` move to `Marks.tsx` to avoid a circular import.

## 3. Stats strip (new, small)

Between hero and how-it-works: three **true product stats** — `3` Steps to
launch, `0` Apps to install, `1` Scan per gift — big `font-display` brand
numbers with labels, counting up (800ms) when the strip scrolls into view.
No fake testimonials/logos/customer metrics: there are no customers yet and
inventing them would damage trust. `CountUp` moves to its own file with
`start` / `startDelay` / `duration` props (shared by hero card and strip).

## 4. How-it-works journey line + step chips

- A decorative SVG path between the heading and the cards (lg+ only) draws
  itself (`pathLength`/`stroke-dashoffset`) when revealed; mirrored via
  `rtl:-scale-x-100`. Static full line under reduced motion.
- Step numbers become 32px rounded chips that start `bg-brand/10 text-brand`
  and fill to solid brand ~0.4s after their card reveals.

## 5. Distinct feature icons

Six inline Lucide-style SVG line icons (24×24, `stroke-width` 1.75,
`currentColor`): scan-frame, activity, smartphone, users, globe, bar-chart —
one per feature, replacing the repeated QrMark (signature mark stays in
eyebrows/nav/footer). Icon sits in a 36px `bg-brand/10 text-brand` rounded tile
that inverts to solid brand on feature hover (`group-hover`, 200ms).

## 6. Form micro-UX + back-to-top

- **Valid-field check**: emerald check icon fades in at the input's end edge
  via CSS `:user-valid` (required fields only: name, company, email). No JS.
- **Send button**: spinner SVG (`animate-spin` — loading indicator, allowed)
  next to "Sending…" while submitting.
- **Success state**: animated SVG circle+check stroke draw (static full mark
  under reduced motion), then the existing success copy.
- **Back to top**: fixed button (44px target) at `start-4` (opposite the
  language toggle), fades in after 600px scroll, smooth-scrolls to top,
  `aria-label` translated.

## Reduced motion & a11y

Every new animation lives inside `@media (prefers-reduced-motion:
no-preference)`; base styles never hide content (connector line, success mark,
stats render fully drawn/final). Icons are `aria-hidden`; the toast and typing
dots are decorative (`aria-hidden`). Touch targets ≥ 44px. New translation
keys (grep-first rule): 'Steps to launch', 'Apps to install', 'Scan per gift',
'Back to top', plus 'Redeemed' if not already present.

## Validation

Vitest suite, `npm run build`, `e2e/landing.spec.ts` unchanged and passing,
lint clean on landing components, screenshots: EN/HE/mobile (scrolled) +
reduced-motion (unscrolled, fully visible).
