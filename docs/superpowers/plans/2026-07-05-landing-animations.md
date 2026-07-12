# Landing Page Animations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the approved orchestrated motion set to the landing page — hero load sequence, counter tick-up, scroll reveals, hover lifts — all reduced-motion safe, with no new dependencies.

**Architecture:** Pure-CSS keyframes for the hero entrance (staggered `animation-delay` utilities in `globals.css`), a one-shot IntersectionObserver `Reveal` wrapper for scroll reveals (stagger applied by delaying the JS flip, NOT `transition-delay` — see constraints), and a tiny rAF `CountUp` inside `HeroMockup`. Everything motion-related lives inside `@media (prefers-reduced-motion: no-preference)`.

**Tech Stack:** Tailwind v4, React 19, CSS keyframes, IntersectionObserver, requestAnimationFrame.

**Spec:** `docs/superpowers/specs/2026-07-05-landing-animations-design.md`
**Branch:** `feat/landing-page` (continue on it; do NOT push)

## Global Constraints

- All new motion must be inert under `prefers-reduced-motion: reduce`; base styles must never hide content for reduced-motion or no-JS users.
- No new dependencies.
- **Tailwind v4 cascade-layer gotcha:** utilities live in `@layer utilities`; unlayered custom CSS in `globals.css` always beats them for the same property. Therefore the `[data-reveal]` rule owns the `transition` property outright — reveal stagger MUST be implemented by delaying the `data-reveal="shown"` flip in JS (setTimeout), never via `transition-delay`, or per-card hover transitions inherit the stagger delay.
- **Tailwind v4 translate utilities set the `translate` property, not `transform`** — hover lifts (`translate`) compose safely with reveal/keyframe `transform`. Include `translate` and `box-shadow` (0.2s) in the `[data-reveal]` transition list so hover still animates on revealed cards.
- Playwright treats `opacity: 0` elements as visible and auto-scrolls on interaction, so `e2e/landing.spec.ts` needs no changes — but **full-page screenshots don't scroll**, so the screenshot script must scroll through the page before capturing.
- Content/copy/labels do not change; no translation keys are added.

---

### Task 1: CSS motion primitives + hero load sequence + hover lifts

**Files:**
- Modify: `src/app/globals.css` (append motion block)
- Modify: `src/components/landing/LandingPage.tsx` (hero + CTA + step-card classes)
- Modify: `src/components/landing/HeroMockup.tsx` (phone rise, card pop)

**Interfaces:**
- Produces: CSS classes `.rise`, `.pop`, `.rise-d1`…`.rise-d4` and the `[data-reveal]` / `[data-reveal="shown"]` rules that Task 3's `Reveal` component depends on.

- [ ] **Step 1: Append the motion block to `globals.css`** (after the `.font-display` rules):

```css
/* --- Landing motion (spec: docs/superpowers/specs/2026-07-05-landing-animations-design.md).
   Everything here is gated on no-preference: reduced-motion users get the
   static page, and base styles never hide content. --- */
@media (prefers-reduced-motion: no-preference) {
  @keyframes rise-in {
    from { opacity: 0; transform: translateY(14px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes pop-in {
    from { opacity: 0; transform: translateY(14px) scale(0.92); }
    to { opacity: 1; transform: translateY(0) scale(1); }
  }
  .rise { animation: rise-in 0.6s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .pop { animation: pop-in 0.55s cubic-bezier(0.16, 1, 0.3, 1) both; }
  .rise-d1 { animation-delay: 80ms; }
  .rise-d2 { animation-delay: 160ms; }
  .rise-d3 { animation-delay: 240ms; }
  .rise-d4 { animation-delay: 450ms; }

  /* Scroll reveal: JS flips data-reveal to "shown" (see Reveal.tsx). translate
     and box-shadow are listed so hover lifts still animate on revealed cards
     (this unlayered rule beats Tailwind's layered transition utilities). */
  [data-reveal] {
    opacity: 0;
    transform: translateY(14px);
    transition:
      opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1),
      transform 0.6s cubic-bezier(0.16, 1, 0.3, 1),
      translate 0.2s ease,
      box-shadow 0.2s ease;
  }
  [data-reveal='shown'] {
    opacity: 1;
    transform: translateY(0);
  }
}
```

- [ ] **Step 2: Stagger the hero in `LandingPage.tsx`**

In the hero section only, change these four elements:

```tsx
            <Eyebrow className="rise text-brand">{t('Employee gifting, scanned')}</Eyebrow>
            <h1 className="font-display rise rise-d1 mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
```

```tsx
            <p className="rise rise-d2 mt-5 max-w-xl text-lg leading-relaxed text-zinc-600">
```

```tsx
            <div className="rise rise-d3 mt-8 flex flex-wrap items-center gap-5">
```

- [ ] **Step 3: Add hover lifts to the three primary CTAs in `LandingPage.tsx`**

Nav "Book a demo" link — replace `transition-opacity` so translate also transitions:

```tsx
              className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 motion-safe:hover:-translate-y-px"
```

Hero "Book a demo" link:

```tsx
                className="rounded-full bg-brand px-6 py-3 text-base font-semibold text-white shadow-md transition hover:opacity-90 motion-safe:hover:-translate-y-px"
```

(The form submit button gets the same treatment in Task 3 when its section is touched.)

- [ ] **Step 4: Animate the mockup in `HeroMockup.tsx`**

Phone wrapper (add `rise rise-d2`):

```tsx
      <div className="rise rise-d2 rounded-[2rem] border border-zinc-200 bg-white p-4 shadow-xl">
```

Floating dashboard card (add `pop rise-d4`):

```tsx
      <div className="pop rise-d4 mt-4 w-full rounded-2xl border border-zinc-100 bg-white p-4 shadow-2xl sm:absolute sm:-bottom-6 sm:-end-8 sm:mt-0 sm:w-56">
```

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: compiles cleanly.

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/components/landing/LandingPage.tsx src/components/landing/HeroMockup.tsx
git commit -m "feat(landing): hero entrance sequence and CTA hover lifts"
```

---

### Task 2: Counter tick-up in the dashboard card

**Files:**
- Modify: `src/components/landing/HeroMockup.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: internal `CountUp` component; the card renders `<CountUp to={312} />` in place of the literal `312`.

- [ ] **Step 1: Add `CountUp` to `HeroMockup.tsx`**

Add the import at the top:

```tsx
import { useEffect, useState } from 'react'
```

Add the component above `HeroMockup`:

```tsx
// Server-renders the final value (no flash without JS), then counts up from 0
// after hydration. Skipped under prefers-reduced-motion.
function CountUp({ to }: { to: number }) {
  const [value, setValue] = useState(to)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    let raf = 0
    const start = performance.now()
    const duration = 1200
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(to * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    setValue(0)
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [to])

  return <>{value}</>
}
```

- [ ] **Step 2: Use it in the card**

```tsx
        <p className="font-display mt-2 text-2xl font-bold">
          <CountUp to={312} />
          <span className="text-base font-medium text-zinc-400"> / 500</span>
        </p>
```

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: compiles cleanly.

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/HeroMockup.tsx
git commit -m "feat(landing): count up redeemed number in the hero dashboard card"
```

---

### Task 3: Scroll reveals

**Files:**
- Create: `src/components/landing/Reveal.tsx`
- Modify: `src/components/landing/LandingPage.tsx` (wrap section content)

**Interfaces:**
- Consumes: `[data-reveal]` CSS from Task 1.
- Produces: `Reveal({ children, delay?: number, className?: string })` — a div wrapper; `delay` (ms) postpones the JS flip for sibling stagger.

- [ ] **Step 1: Create `src/components/landing/Reveal.tsx`**

```tsx
'use client'

import { useEffect, useRef, type ReactNode } from 'react'

// One-shot scroll reveal: flips data-reveal to "shown" when ~15% visible, then
// disconnects. Content stays in the DOM at full layout size — only
// opacity/transform change (CSS in globals.css), so crawlers and tests see
// everything. Stagger is applied by delaying the flip in JS, NOT via
// transition-delay, so hover transitions on revealed cards stay instant.
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode
  delay?: number
  className?: string
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (typeof IntersectionObserver === 'undefined') {
      el.dataset.reveal = 'shown'
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        observer.disconnect()
        if (delay > 0) {
          timer = setTimeout(() => {
            el.dataset.reveal = 'shown'
          }, delay)
        } else {
          el.dataset.reveal = 'shown'
        }
      },
      { threshold: 0.15 }
    )
    observer.observe(el)
    return () => {
      observer.disconnect()
      if (timer) clearTimeout(timer)
    }
  }, [delay])

  return (
    <div ref={ref} data-reveal="" className={className}>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Wire reveals into `LandingPage.tsx`**

Add the import:

```tsx
import { Reveal } from './Reveal'
```

Add a no-JS fallback as the first child of the root div (so content is never
hidden when JavaScript is off):

```tsx
      <noscript>
        <style>{`[data-reveal]{opacity:1 !important;transform:none !important}`}</style>
      </noscript>
```

**How-it-works section** — wrap the heading block, and move each card's styling
onto a `Reveal` inside the `li` (the `li` becomes a bare wrapper so the border
and content fade in together); the card also gains its hover lift here:

```tsx
        <section id="how-it-works" className="border-y border-zinc-100 bg-zinc-50">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
            <Reveal>
              <Eyebrow>{t('How it works')}</Eyebrow>
              <h2 className="font-display mt-3 text-3xl font-bold tracking-tight">
                {t('From employee list to gift day in three steps')}
              </h2>
            </Reveal>
            <ol className="mt-10 grid gap-6 lg:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title}>
                  <Reveal
                    delay={i * 100}
                    className="h-full rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm hover:shadow-md motion-safe:hover:-translate-y-0.5"
                  >
                    <p className="font-display text-sm font-bold text-brand">{i + 1}</p>
                    <h3 className="mt-2 text-lg font-semibold">{t(step.title)}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-600">{t(step.body)}</p>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>
```

**Why section** — wrap heading and each feature (features are not cards, no hover):

```tsx
        <section id="why" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <Reveal>
            <Eyebrow>{t('Why GiftFlow')}</Eyebrow>
            <h2 className="font-display mt-3 text-3xl font-bold tracking-tight">
              {t('Built for the day itself')}
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 50}>
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  <QrMark className="text-brand" />
                  {t(f.title)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{t(f.body)}</p>
              </Reveal>
            ))}
          </div>
        </section>
```

**Contact section** — wrap the two columns (0 / 100ms):

```tsx
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
            <Reveal>
              <Eyebrow className="text-indigo-300">{t('Book a demo')}</Eyebrow>
              <h2 className="font-display mt-3 text-3xl font-bold tracking-tight">
                {t('See your next gift day in GiftFlow')}
              </h2>
              <p className="mt-4 max-w-md leading-relaxed text-indigo-200/90">
                {t("Tell us about your next gift day and we'll show you GiftFlow in action.")}
              </p>
            </Reveal>
            <Reveal delay={100}>
              <ContactForm />
            </Reveal>
          </div>
```

- [ ] **Step 3: Add the hover lift to the form submit button in `ContactForm.tsx`**

```tsx
        className="rounded-full bg-white px-6 py-3 text-base font-semibold text-indigo-950 transition hover:bg-indigo-100 disabled:opacity-60 motion-safe:hover:-translate-y-px"
```

- [ ] **Step 4: Verify build + e2e**

Run: `npm run build`
Expected: compiles cleanly.

Run: `npx playwright test e2e/landing.spec.ts`
Expected: 5 passed (setup ×3 + 2 landing tests) — reveals keep elements in layout, Playwright auto-scrolls.

- [ ] **Step 5: Commit**

```bash
git add src/components/landing/Reveal.tsx src/components/landing/LandingPage.tsx src/components/landing/ContactForm.tsx
git commit -m "feat(landing): one-shot scroll reveals with sibling stagger"
```

---

### Task 4: Full validation

**Files:**
- Modify: screenshot script in scratchpad (scroll pass + reduced-motion context) — not committed.

- [ ] **Step 1: Run the full suite**

```bash
npm run test    # expected: 284 passed
npm run build   # expected: compiles
npx playwright test e2e/landing.spec.ts  # expected: 5 passed
npx eslint src/components/landing/ src/app/globals.css 2>/dev/null; npx eslint src/components/landing/  # expected: clean
```

- [ ] **Step 2: Screenshot verification (script in scratchpad, run via temp copy in repo root)**

The script must, per context: (a) scroll to the bottom in steps (~600px, 150ms
apart) so every `Reveal` fires, wait 800ms, then capture `fullPage`; (b) also
capture one context created with `reducedMotion: 'reduce'` WITHOUT scrolling —
every section must be fully visible in that shot (proves the gate).

```js
import { chromium } from '@playwright/test'

const OUT = process.argv[2]
const browser = await chromium.launch()

async function scrollThrough(page) {
  await page.evaluate(async () => {
    for (let y = 0; y <= document.body.scrollHeight; y += 600) {
      window.scrollTo(0, y)
      await new Promise((r) => setTimeout(r, 150))
    }
    window.scrollTo(0, 0)
  })
  await page.waitForTimeout(800)
}

for (const locale of ['en', 'he']) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
  await ctx.addCookies([{ name: 'giftflow-locale', value: locale, url: 'http://localhost:3000' }])
  const page = await ctx.newPage()
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
  await scrollThrough(page)
  await page.screenshot({ path: `${OUT}/anim-${locale}-full.png`, fullPage: true })
  await ctx.close()
}

// Reduced motion, NO scrolling — everything must already be visible.
const rctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  reducedMotion: 'reduce',
})
const rpage = await rctx.newPage()
await rpage.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
await rpage.screenshot({ path: `${OUT}/anim-reduced-full.png`, fullPage: true })
await rctx.close()

// Mobile EN with scroll pass
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const mpage = await mctx.newPage()
await mpage.goto('http://localhost:3000/', { waitUntil: 'networkidle' })
await scrollThrough(mpage)
await mpage.screenshot({ path: `${OUT}/anim-en-mobile.png`, fullPage: true })
await mctx.close()

await browser.close()
console.log('done')
```

Inspect: EN/HE/mobile shots show all sections revealed; the reduced-motion shot
shows the complete static page with no invisible sections.

- [ ] **Step 3: Report** — summarize what changed, what was validated, remaining risk (per project output rule). No push.

## Post-plan notes

- No translation keys, no API changes, no schema changes.
- If any Reveal-wrapped section appears blank in the scrolled screenshots, the bug is in the observer flip (check `data-reveal` attributes in the DOM), not the CSS.
