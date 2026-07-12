# Landing Redesign (ui-ux-pro-max) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the six approved enhancements — hero choreography, nav progress/scrollspy, stats strip, journey line + step chips, feature icons, form micro-UX + back-to-top.

**Architecture:** All motion stays CSS-first inside the existing `@media (prefers-reduced-motion: no-preference)` block in `globals.css`. Shared pieces (`QrMark`/`Eyebrow`, `CountUp`) move to their own files so `LandingNav`, `StatsStrip`, and `HeroMockup` can import them without circular imports. New client components: `LandingNav`, `StatsStrip`, `BackToTop`.

**Tech Stack:** Tailwind v4, React 19, CSS keyframes, IntersectionObserver, rAF.

**Spec:** `docs/superpowers/specs/2026-07-05-landing-redesign-design.md`
**Branch:** `feat/landing-page` (continue; do NOT push)

## Global Constraints

- Brand stays indigo `#6366f1` + Space Grotesk/Inter/Heebo; no copy rewrites; no new dependencies; no API/schema changes.
- Every new animation inside `@media (prefers-reduced-motion: no-preference)`; base styles never hide content (connector, success mark, stats render final/drawn without motion).
- RTL: logical utilities only; direction-sensitive transforms get `rtl:` variants.
- Translation grep-first rule; `'Redeemed'` already exists at translations.he.ts:155 — reuse. New keys: 'Steps to launch', 'Apps to install', 'Scan per gift', 'Back to top'.
- `e2e/landing.spec.ts` must pass unchanged.
- Tailwind v4 gotchas from the previous plan still apply (unlayered CSS beats utilities; `translate` ≠ `transform`).
- Touch targets ≥ 44px; icons `aria-hidden`; no emoji as UI icons (SMS bubble 🎁 is message *content*, allowed).

---

### Task 1: Extract shared `Marks.tsx` and `CountUp.tsx`

**Files:**
- Create: `src/components/landing/Marks.tsx` (move `QrMark`, `Eyebrow` out of `LandingPage.tsx`)
- Create: `src/components/landing/CountUp.tsx` (move out of `HeroMockup.tsx`, add props)
- Modify: `src/components/landing/LandingPage.tsx`, `src/components/landing/HeroMockup.tsx`

**Interfaces:**
- Produces: `QrMark({ className? })`, `Eyebrow({ children, className? })` from `./Marks`; `CountUp({ to, start = true, startDelay = 0, duration = 1200 }): value rendered as fragment` from `./CountUp`. Tasks 2–4 import these exact names.

- [ ] **Step 1: Create `src/components/landing/Marks.tsx`** — cut `QrMark` and `Eyebrow` from `LandingPage.tsx` verbatim (including the signature-glyph comment), prepend:

```tsx
import type { ReactNode } from 'react'
```

(No `'use client'` needed — they're presentational; they inherit the client boundary of importers.)

- [ ] **Step 2: Create `src/components/landing/CountUp.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'

// Server-renders the final value (no flash without JS), then counts up from 0
// after hydration once `start` is true. Skipped under prefers-reduced-motion.
export function CountUp({
  to,
  start = true,
  startDelay = 0,
  duration = 1200,
}: {
  to: number
  start?: boolean
  startDelay?: number
  duration?: number
}) {
  const [value, setValue] = useState(to)

  useEffect(() => {
    if (!start) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    let begun = 0
    const tick = (now: number) => {
      if (!begun) begun = now
      const p = Math.min((now - begun) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(to * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    const timer = setTimeout(() => {
      raf = requestAnimationFrame(tick)
    }, startDelay)
    return () => {
      clearTimeout(timer)
      cancelAnimationFrame(raf)
    }
  }, [to, start, startDelay, duration])

  return <>{value}</>
}
```

- [ ] **Step 3: Update importers.** In `LandingPage.tsx`: delete the local `QrMark`/`Eyebrow` definitions and the now-unused `ReactNode` import, add `import { QrMark, Eyebrow } from './Marks'`, and **re-export for compatibility**: `export { QrMark, Eyebrow } from './Marks'`. In `HeroMockup.tsx`: delete the local `CountUp` and its `useEffect/useState` import, add `import { CountUp } from './CountUp'`.

- [ ] **Step 4: Verify + commit**

Run: `npm run build` → compiles. `npm run test` → 284 passed.

```bash
git add src/components/landing/
git commit -m "refactor(landing): extract Marks and CountUp into shared files"
```

---

### Task 2: Hero choreography

**Files:**
- Modify: `src/app/globals.css` (inside the existing no-preference media block)
- Modify: `src/components/landing/HeroMockup.tsx`
- Modify: `src/components/landing/LandingPage.tsx` (hero glow)

**Interfaces:**
- Consumes: `CountUp` (`start`, `startDelay`) from Task 1.
- Produces: CSS classes `.sms-typing`, `.sms-msg`, `.scan-once`, `.d-hero-card`, `.bar-grow`, `.toast-in` used only by `HeroMockup`.

- [ ] **Step 1: Append to the `@media (prefers-reduced-motion: no-preference)` block in `globals.css`:**

```css
  /* Hero choreography: typing dots → message+QR → scan sweep → card pop →
     counter/bar → redeemed toast. All one-shot. */
  @keyframes sms-typing-window {
    0% { opacity: 0 }
    12% { opacity: 1 }
    85% { opacity: 1 }
    100% { opacity: 0 }
  }
  .sms-typing { animation: sms-typing-window 1.1s linear 0.5s both; }
  @keyframes dot-pulse {
    50% { transform: translateY(-3px); opacity: 0.5 }
  }
  .sms-typing span {
    animation: dot-pulse 0.55s ease-in-out 0.5s 2;
  }
  .sms-typing span:nth-child(2) { animation-delay: 0.65s }
  .sms-typing span:nth-child(3) { animation-delay: 0.8s }
  .sms-msg { animation: rise-in 0.5s cubic-bezier(0.16, 1, 0.3, 1) 1.6s both; }
  @keyframes scan-sweep {
    0% { transform: translateY(-48px); opacity: 0 }
    8% { opacity: 0.9 }
    50% { transform: translateY(48px); opacity: 1 }
    92% { opacity: 0.9 }
    100% { transform: translateY(-48px); opacity: 0 }
  }
  .scan-once { animation: scan-sweep 2.4s ease-in-out 2s 2 both; }
  .d-hero-card { animation-delay: 2.1s; }
  @keyframes bar-fill { from { transform: scaleX(0) } to { transform: scaleX(1) } }
  .bar-grow {
    transform-origin: 0% 50%;
    animation: bar-fill 1s cubic-bezier(0.16, 1, 0.3, 1) 2.4s both;
  }
  [dir='rtl'] .bar-grow { transform-origin: 100% 50%; }
  .toast-in { animation: pop-in 0.45s cubic-bezier(0.16, 1, 0.3, 1) 3.4s both; }
```

- [ ] **Step 2: Rewrite the bubble + card internals in `HeroMockup.tsx`.** The message content wrapper reserves layout (dots overlay absolutely, no jump); scan-line uses `.scan-once` instead of `animate-scan-line`; card uses `.d-hero-card` (replacing `rise-d4`); counter gets `startDelay={2400}`; progress bar inner gets `.bar-grow`; toast pill added. Full component body after the changes:

```tsx
export function HeroMockup() {
  const t = useT()
  return (
    <div className="relative mx-auto w-full max-w-sm" aria-hidden="true">
      {/* Phone showing the SMS every employee receives */}
      <div className="rise rise-d2 rounded-[2rem] border border-zinc-200 bg-white p-4 shadow-xl">
        <div className="rounded-2xl bg-zinc-50 p-4">
          <p className="text-xs font-medium text-zinc-400">GiftFlow</p>
          <div className="relative mt-2 rounded-2xl rounded-ss-sm bg-white p-4 shadow-sm">
            {/* Typing indicator — overlays, then fades as the message appears */}
            <div className="sms-typing absolute start-4 top-4 flex gap-1 opacity-0" aria-hidden="true">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" />
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" />
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" />
            </div>
            <div className="sms-msg">
              <p className="text-sm text-zinc-800">{t('Hi Dana! Your holiday gift is waiting 🎁')}</p>
              <p className="mt-1 text-sm text-zinc-500">{t('Show this code at the event:')}</p>
              <div className="relative mt-3 flex justify-center overflow-hidden py-2 text-zinc-900">
                <FakeQr />
                <div className="scan-once absolute inset-x-6 top-1/2 h-0.5 rounded bg-brand/70 opacity-0 motion-reduce:hidden" />
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Floating live-dashboard card — the HR side of the same moment.
          On mobile there's no room beside the phone, so it stacks below. */}
      <div className="pop d-hero-card mt-4 w-full rounded-2xl border border-zinc-100 bg-white p-4 shadow-2xl sm:absolute sm:-bottom-6 sm:-end-8 sm:mt-0 sm:w-56">
        {/* Redeemed toast — lands after the counter settles */}
        <div className="toast-in absolute -top-3 end-3 flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white opacity-0 shadow-md motion-reduce:hidden">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          {t('Redeemed')}
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-zinc-500">{t('Holiday campaign')}</p>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            {t('Live')}
          </span>
        </div>
        <p className="font-display mt-2 text-2xl font-bold">
          <CountUp to={312} startDelay={2400} />
          <span className="text-base font-medium text-zinc-400"> / 500</span>
        </p>
        <p className="text-xs text-zinc-500">{t('gifts redeemed')}</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
          <div className="bar-grow h-full w-[62%] rounded-full bg-brand" />
        </div>
      </div>
    </div>
  )
}
```

Notes: `.sms-typing`/`.scan-once`/`.toast-in` carry `opacity-0` (typing/toast) or `opacity-0` (scan) as base so they simply never appear under reduced motion (they are decorative narrative, `motion-reduce:hidden` doubles the guarantee on scan/toast). The message content has NO base hiding — `.sms-msg` only animates under no-preference, so reduced-motion users see the full bubble immediately.

- [ ] **Step 3: Hero glow in `LandingPage.tsx`** — hero `<section>` gains `relative` and this first child:

```tsx
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55%_45%_at_72%_18%,rgba(99,102,241,0.09),transparent)]" />
```

- [ ] **Step 4: Verify + commit**

Run: `npm run build` → compiles. Dev-server eyeball: typing dots → message → two sweeps → card pop → count → toast.

```bash
git add src/app/globals.css src/components/landing/HeroMockup.tsx src/components/landing/LandingPage.tsx
git commit -m "feat(landing): choreographed hero — typing SMS, finite scan sweep, timed card, redeemed toast"
```

---

### Task 3: `LandingNav` — progress bar, scrollspy, scroll shadow, smooth anchors

**Files:**
- Create: `src/components/landing/LandingNav.tsx`
- Modify: `src/components/landing/LandingPage.tsx` (replace inline `<header>`, add `scroll-mt-16` to the three sections)
- Modify: `src/app/globals.css` (smooth scroll)

**Interfaces:**
- Consumes: `QrMark` from `./Marks` (Task 1).
- Produces: `LandingNav()` — self-contained; `LandingPage` renders `<LandingNav />` where the `<header>` was.

- [ ] **Step 1: Smooth scrolling in `globals.css`** (inside the no-preference block):

```css
  html { scroll-behavior: smooth; }
```

- [ ] **Step 2: Create `src/components/landing/LandingNav.tsx`:**

```tsx
'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useT } from '@/lib/i18n/useT'
import { QrMark } from './Marks'

const SECTION_IDS = ['how-it-works', 'why', 'contact'] as const

export function LandingNav() {
  const t = useT()
  const [active, setActive] = useState<string>('')
  const [scrolled, setScrolled] = useState(false)
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let raf = 0
    const update = () => {
      setScrolled(window.scrollY > 8)
      const max = document.documentElement.scrollHeight - window.innerHeight
      const p = max > 0 ? Math.min(window.scrollY / max, 1) : 0
      if (barRef.current) barRef.current.style.transform = `scaleX(${p})`
    }
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setActive(entry.target.id)
        }
      },
      { rootMargin: '-40% 0px -55% 0px' }
    )
    for (const id of SECTION_IDS) {
      const el = document.getElementById(id)
      if (el) observer.observe(el)
    }
    return () => {
      window.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
      observer.disconnect()
    }
  }, [])

  const linkClass = (id: string) =>
    `hidden text-sm font-medium transition-colors sm:block ${
      active === id ? 'text-zinc-900' : 'text-zinc-600 hover:text-zinc-900'
    }`

  return (
    <header
      className={`sticky top-0 z-40 border-b border-zinc-100 bg-white/80 backdrop-blur transition-shadow ${
        scrolled ? 'shadow-sm' : ''
      }`}
    >
      <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <a href="#top" className="font-display flex items-center gap-2 text-lg font-bold tracking-tight">
          <QrMark className="text-brand" />
          GiftFlow
        </a>
        <div className="flex items-center gap-3 sm:gap-6">
          <a href="#how-it-works" className={linkClass('how-it-works')}>
            {t('How it works')}
          </a>
          <a href="#why" className={linkClass('why')}>
            {t('Why GiftFlow')}
          </a>
          <Link href="/login" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
            {t('Log in')}
          </Link>
          <a
            href="#contact"
            className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 motion-safe:hover:-translate-y-px"
          >
            {t('Book a demo')}
          </a>
        </div>
      </nav>
      {/* Reading progress along the header's bottom edge */}
      <div
        ref={barRef}
        aria-hidden="true"
        className="absolute inset-x-0 bottom-0 h-0.5 origin-left scale-x-0 bg-brand rtl:origin-right"
      />
    </header>
  )
}
```

- [ ] **Step 3: Wire into `LandingPage.tsx`** — add `import { LandingNav } from './LandingNav'`, replace the whole `<header>…</header>` block with `<LandingNav />`, remove the now-unused `Link` import **only if** no other usage remains (the footer still uses `Link` — keep it). Add `scroll-mt-16` to the `className` of the `#how-it-works`, `#why`, and `#contact` sections.

- [ ] **Step 4: Verify + commit**

Run: `npm run build` → compiles. `npx playwright test e2e/landing.spec.ts` → 5 passed.

```bash
git add src/components/landing/LandingNav.tsx src/components/landing/LandingPage.tsx src/app/globals.css
git commit -m "feat(landing): nav scroll progress, scrollspy, scroll shadow, smooth anchors"
```

---

### Task 4: Stats strip

**Files:**
- Create: `src/components/landing/StatsStrip.tsx`
- Modify: `src/components/landing/LandingPage.tsx` (render between hero and how-it-works)
- Modify: `src/lib/i18n/translations.he.ts`

**Interfaces:**
- Consumes: `CountUp` (`start` prop) from Task 1.

- [ ] **Step 1: Create `src/components/landing/StatsStrip.tsx`:**

```tsx
'use client'

import { useEffect, useRef, useState } from 'react'
import { useT } from '@/lib/i18n/useT'
import { CountUp } from './CountUp'

// True product facts only — no invented customer metrics.
const STATS = [
  { value: 3, label: 'Steps to launch' },
  { value: 0, label: 'Apps to install' },
  { value: 1, label: 'Scan per gift' },
]

export function StatsStrip() {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      setStarted(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setStarted(true)
          observer.disconnect()
        }
      },
      { threshold: 0.4 }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
      <div ref={ref} className="grid grid-cols-3 gap-6 border-t border-zinc-100 pt-10">
        {STATS.map((s) => (
          <div key={s.label} className="text-center">
            <p className="font-display text-4xl font-bold text-brand">
              <CountUp to={s.value} start={started} duration={800} />
            </p>
            <p className="mt-1 text-sm font-medium text-zinc-500">{t(s.label)}</p>
          </div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Render it in `LandingPage.tsx`** — `import { StatsStrip } from './StatsStrip'`; add `<StatsStrip />` in `<main>` directly after the hero `</section>`, before `#how-it-works`.

- [ ] **Step 3: Translations** (grep-first; all three are new):

```ts
  'Steps to launch': 'צעדים להשקה',
  'Apps to install': 'אפליקציות להתקין',
  'Scan per gift': 'סריקה לכל מתנה',
```

- [ ] **Step 4: Verify + commit**

Run: `npm run build` → compiles; duplicate-key awk check clean.

```bash
git add src/components/landing/StatsStrip.tsx src/components/landing/LandingPage.tsx src/lib/i18n/translations.he.ts
git commit -m "feat(landing): product-fact stats strip with count-up on reveal"
```

---

### Task 5: Journey line + step chips

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/components/landing/LandingPage.tsx` (how-it-works section)

- [ ] **Step 1: CSS** (inside the no-preference block — outside it the line renders fully drawn and chips render filled):

```css
  /* How-it-works journey line: draws when its Reveal flips to shown */
  .connector-path { stroke-dasharray: 1; stroke-dashoffset: 1; }
  [data-reveal='shown'] .connector-path {
    animation: draw-stroke 1.4s ease-in-out 0.3s both;
  }
  @keyframes draw-stroke { to { stroke-dashoffset: 0 } }
  /* Step chips fill shortly after their card reveals */
  .step-chip { transition: background-color 0.4s ease 0.4s, color 0.4s ease 0.4s; }
```

And in `LandingPage.tsx` step chips use CSS below (add to the same block):

```css
  [data-reveal] .step-chip { background: color-mix(in oklab, var(--brand) 10%, white); color: var(--brand); }
  [data-reveal='shown'] .step-chip { background: var(--brand); color: white; }
```

- [ ] **Step 2: Update the how-it-works section in `LandingPage.tsx`** — between the heading `Reveal` and the `<ol>`, insert the connector; change `<ol>` top margin to `mt-6`; replace the number `<p>` with a chip `<span>`:

```tsx
            <Reveal className="mt-8 hidden lg:block">
              <svg viewBox="0 0 100 10" preserveAspectRatio="none" aria-hidden="true" className="h-8 w-full overflow-visible text-brand/40 rtl:-scale-x-100">
                <path
                  d="M0 5 C 20 -3, 32 13, 50 5 S 82 -3, 100 5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  pathLength="1"
                  vectorEffect="non-scaling-stroke"
                  className="connector-path"
                />
              </svg>
            </Reveal>
            <ol className="mt-6 grid gap-6 lg:grid-cols-3">
```

Chip (inside each card's `Reveal`, replacing `<p className="font-display text-sm font-bold text-brand">{i + 1}</p>`):

```tsx
                    <span className="step-chip font-display flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
                      {i + 1}
                    </span>
```

(Base class is the *final* filled state — the CSS above overrides to the tinted state pre-reveal only under no-preference, so reduced-motion/no-JS users see filled chips.)

- [ ] **Step 3: Verify + commit**

Run: `npm run build` → compiles. Eyeball: line draws start→end (mirrored in HE), chips fill after cards land.

```bash
git add src/app/globals.css src/components/landing/LandingPage.tsx
git commit -m "feat(landing): drawn journey line and filling step chips in how-it-works"
```

---

### Task 6: Feature icons

**Files:**
- Create: `src/components/landing/FeatureIcon.tsx`
- Modify: `src/components/landing/LandingPage.tsx` (FEATURES entries + feature markup)

**Interfaces:**
- Produces: `FeatureIcon({ name }: { name: FeatureIconName })` with `FeatureIconName = 'scan' | 'activity' | 'phone' | 'users' | 'globe' | 'chart'`.

- [ ] **Step 1: Create `src/components/landing/FeatureIcon.tsx`:**

```tsx
import type { ReactNode } from 'react'

export type FeatureIconName = 'scan' | 'activity' | 'phone' | 'users' | 'globe' | 'chart'

// Lucide-style inline line icons (24×24, stroke currentColor).
const PATHS: Record<FeatureIconName, ReactNode> = {
  scan: (
    <>
      <path d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M7 12h10" />
    </>
  ),
  activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  phone: (
    <>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M12 18h.01" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </>
  ),
  chart: (
    <>
      <path d="M3 3v18h18" />
      <path d="M7 13v5" />
      <path d="M12 8v10" />
      <path d="M17 11v7" />
    </>
  ),
}

export function FeatureIcon({ name }: { name: FeatureIconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
```

- [ ] **Step 2: Wire into `LandingPage.tsx`.** Import `FeatureIcon` and `type FeatureIconName`. Add `icon` to each FEATURES entry in order: `'scan'`, `'activity'`, `'phone'`, `'users'`, `'globe'`, `'chart'` (typed `icon: FeatureIconName`). Feature markup becomes:

```tsx
              <Reveal key={f.title} delay={i * 50} className="group">
                <h3 className="flex items-center gap-3 text-base font-semibold">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand transition-colors duration-200 group-hover:bg-brand group-hover:text-white">
                    <FeatureIcon name={f.icon} />
                  </span>
                  {t(f.title)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{t(f.body)}</p>
              </Reveal>
```

(`QrMark` no longer renders in features — the signature stays in eyebrows/nav/footer.)

- [ ] **Step 3: Verify + commit**

Run: `npm run build` → compiles.

```bash
git add src/components/landing/FeatureIcon.tsx src/components/landing/LandingPage.tsx
git commit -m "feat(landing): distinct SVG line icons per feature with hover tiles"
```

---

### Task 7: Form micro-UX + back-to-top

**Files:**
- Create: `src/components/landing/BackToTop.tsx`
- Modify: `src/components/landing/ContactForm.tsx`
- Modify: `src/app/globals.css`
- Modify: `src/components/landing/LandingPage.tsx` (render `<BackToTop />`)
- Modify: `src/lib/i18n/translations.he.ts`

- [ ] **Step 1: CSS.** OUTSIDE the motion media block (state indication, not decoration):

```css
/* Contact form: positive validity indicator (required fields only) */
.valid-check {
  opacity: 0;
  transform: scale(0.6);
  transition: opacity 0.2s ease, transform 0.2s ease;
}
input:user-valid + .valid-check {
  opacity: 1;
  transform: scale(1);
}
```

INSIDE the no-preference block (decorative draw — reduced motion sees the full mark because these rules simply don't apply):

```css
  .draw-stroke-1,
  .draw-stroke-2 {
    stroke-dasharray: 1;
    stroke-dashoffset: 1;
    animation: draw-stroke 0.5s ease-out both;
  }
  .draw-stroke-2 { animation-delay: 0.35s; }
```

(`draw-stroke` keyframes already exist from Task 5.)

- [ ] **Step 2: `ContactForm.tsx` changes.**

Success block becomes (text unchanged — e2e depends on it):

```tsx
  if (status === 'success') {
    return (
      <div className="rounded-2xl border border-indigo-800 bg-indigo-900/50 p-10 text-center">
        <svg viewBox="0 0 52 52" className="mx-auto mb-4 h-12 w-12 text-emerald-400" aria-hidden="true">
          <circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="2" pathLength="1" className="draw-stroke-1" />
          <path d="M15 27l8 8 15-15" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" pathLength="1" className="draw-stroke-2" />
        </svg>
        <p className="text-lg font-medium">{t("Thanks! We'll be in touch within one business day.")}</p>
      </div>
    )
  }
```

The three REQUIRED inputs (name, company, email) each get wrapped so the check can sit inside the field; pattern (shown for name — repeat for company and email, keeping each input's existing attributes):

```tsx
        <label className="grid gap-1.5 text-sm font-medium text-indigo-100">
          {t('Full name')}
          <span className="relative block">
            <input name="name" required maxLength={120} className={inputClass} />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="valid-check pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-400" aria-hidden="true">
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </span>
        </label>
```

Note: `-translate-y-1/2` sets the `translate` property; `.valid-check`'s `transform: scale()` composes with it (different properties) — vertical centering survives the scale transition.

Submit button content becomes:

```tsx
        {status === 'sending' ? (
          <span className="inline-flex items-center justify-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 animate-spin" aria-hidden="true">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
              <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            </svg>
            {t('Sending…')}
          </span>
        ) : (
          t('Send')
        )}
```

- [ ] **Step 3: Create `src/components/landing/BackToTop.tsx`:**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n/useT'

// Opposite side (start-4) from the floating LanguageToggle (end-4).
export function BackToTop() {
  const t = useT()
  const [show, setShow] = useState(false)

  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 600)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <button
      onClick={() => window.scrollTo({ top: 0 })}
      aria-label={t('Back to top')}
      className={`fixed bottom-20 start-4 z-50 rounded-full border border-zinc-200 bg-white p-3 text-zinc-700 shadow-md transition hover:text-zinc-900 hover:shadow-lg md:bottom-4 ${
        show ? 'opacity-100' : 'pointer-events-none translate-y-2 opacity-0'
      }`}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
        <path d="m18 15-6-6-6 6" />
      </svg>
    </button>
  )
}
```

Render `<BackToTop />` in `LandingPage.tsx` just before the closing `</div>` of the root, importing it. (`window.scrollTo` rides the global smooth-scroll CSS; instant under reduced motion.)

- [ ] **Step 4: Translation** (grep-first; new):

```ts
  'Back to top': 'חזרה למעלה',
```

- [ ] **Step 5: Verify + commit**

Run: `npm run build`; `npx playwright test e2e/landing.spec.ts` → 5 passed (success text/labels unchanged).

```bash
git add src/components/landing/BackToTop.tsx src/components/landing/ContactForm.tsx src/components/landing/LandingPage.tsx src/app/globals.css src/lib/i18n/translations.he.ts
git commit -m "feat(landing): form validity checks, sending spinner, drawn success mark, back-to-top"
```

---

### Task 8: Full validation

- [ ] **Step 1:** `npm run test` → 284 passed; `npm run build` → compiles; `npx playwright test e2e/landing.spec.ts` → 5 passed; `npx eslint src/components/landing/` → clean; duplicate-key awk check on translations → empty.

- [ ] **Step 2:** Screenshots via the existing scratchpad `shots2.mjs` (scroll pass + reduced-motion context + mobile), run from a temp copy in the repo root. Verify: EN/HE/mobile fully revealed with new details (stats strip, chips, icons, connector); reduced-motion shot fully visible without scrolling — connector fully drawn, chips filled, counter at final values, no typing dots/toast artifacts.

- [ ] **Step 3:** Report per project output rule (what changed / validated / remaining risk). Do not push.

## Post-plan notes

- If the hero timeline feels slow, the single tuning point is the delay values in the Task 2 CSS block.
- `sms-typing` dots use a 2-iteration pulse — no infinite decorative animation (ui-ux-pro-max anti-pattern).
