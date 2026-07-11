'use client'

import { useRef, type MouseEvent, type ReactNode } from 'react'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

const PARTICLE_COUNT = 12

// Deterministic pseudo-random layout (golden-angle spread) so particle
// positions don't shift between server render and hydration.
const PARTICLES = Array.from({ length: PARTICLE_COUNT }, (_, i) => {
  const seed = i * 137.5
  return {
    left: seed % 100,
    top: (seed * 1.7) % 100,
    size: 3 + (i % 4),
    delay: (i % 6) * 0.8,
    duration: 10 + (i % 5) * 2,
  }
})

// Wraps the hero section with a cursor-following ambient glow and a handful
// of slow drifting particles behind the phone mockup. Purely decorative
// texture — understated on purpose. Both effects are skipped entirely under
// reduced motion (checked once, same pattern as CountUp.tsx).
export function HeroAmbient({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLElement>(null)
  const reducedMotion = usePrefersReducedMotion()

  function handleMouseMove(e: MouseEvent<HTMLElement>) {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    el.style.setProperty('--glow-x', `${((e.clientX - rect.left) / rect.width) * 100}%`)
    el.style.setProperty('--glow-y', `${((e.clientY - rect.top) / rect.height) * 100}%`)
  }

  return (
    <section ref={ref} className={className} onMouseMove={reducedMotion ? undefined : handleMouseMove}>
      {!reducedMotion && <div aria-hidden="true" className="hero-glow pointer-events-none absolute inset-0 -z-10" />}
      {!reducedMotion && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
          {PARTICLES.map((p, i) => (
            <span
              key={i}
              className="hero-particle absolute rounded-full"
              style={{
                left: `${p.left}%`,
                top: `${p.top}%`,
                width: p.size,
                height: p.size,
                backgroundColor: 'color-mix(in srgb, var(--brand, #6366f1) 30%, transparent)',
                animationDelay: `${p.delay}s`,
                animationDuration: `${p.duration}s`,
              }}
            />
          ))}
        </div>
      )}
      {children}
    </section>
  )
}
