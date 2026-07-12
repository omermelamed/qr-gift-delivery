'use client'

import { useRef, type MouseEvent, type ReactNode } from 'react'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

// Wraps the hero section with a cursor-following ambient glow behind the
// phone mockup. Purely decorative texture — understated on purpose. Skipped
// entirely under reduced motion (checked once, same pattern as CountUp.tsx).
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
      {children}
    </section>
  )
}
