'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n/useT'
import { Reveal } from './Reveal'
import { STEPS } from './steps'

const AUTOPLAY_MS = 3200

// Interactive step rail for the "how it works" section: a progress rail plus
// three clickable step cards. The active step auto-advances on a timer that
// resets on every manual click, and never runs under reduced motion.
export function StepRail() {
  const t = useT()
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const timer = setInterval(() => {
      setActive((a) => (a + 1) % STEPS.length)
    }, AUTOPLAY_MS)
    return () => clearInterval(timer)
  }, [active])

  return (
    <>
      <Reveal className="mt-8">
        <div className="h-1 w-full overflow-hidden rounded-full bg-zinc-200" aria-hidden="true">
          <div
            className="h-full origin-left rounded-full bg-brand rtl:origin-right"
            style={{
              transform: `scaleX(${(active + 1) / STEPS.length})`,
              // `.bg-brand`'s own `transition: background-color …` is plain
              // (unlayered) CSS, so it always wins the cascade over Tailwind's
              // layered `transition-transform` utility on this same element —
              // that utility was silently doing nothing, so the fill jumped
              // instantly instead of animating. Set inline to guarantee it wins.
              transition: 'transform 500ms ease-out',
            }}
          />
        </div>
      </Reveal>
      <ol className="mt-6 grid gap-6 lg:grid-cols-3">
        {STEPS.map((step, i) => (
          <li key={step.title}>
            <Reveal delay={i * 100} className="h-full">
              <button
                type="button"
                onClick={() => setActive(i)}
                aria-pressed={active === i}
                className={`h-full w-full rounded-2xl border bg-white p-6 text-start shadow-sm transition motion-safe:hover:-translate-y-0.5 ${
                  active === i ? 'border-brand shadow-md ring-1 ring-brand' : 'border-zinc-100 hover:shadow-md'
                }`}
              >
                <span
                  data-active={active === i}
                  className="step-chip font-display flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white"
                >
                  {i + 1}
                </span>
                <h3 className="mt-2 text-lg font-semibold">{t(step.title)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{t(step.body)}</p>
              </button>
            </Reveal>
          </li>
        ))}
      </ol>
    </>
  )
}
