'use client'

import { useRef, type MouseEvent, type ReactNode } from 'react'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

const MAX_TILT_DEG = 6

// Subtle pointer-driven tilt for a card, following the cursor within its own
// bounds and resetting on mouse-leave. Under reduced motion the
// mousemove/mouseleave handlers are never attached at all (not just a no-op
// inside the handler).
export function TiltCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const reducedMotion = usePrefersReducedMotion()

  function handleMouseMove(e: MouseEvent<HTMLDivElement>) {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const px = (e.clientX - rect.left) / rect.width
    const py = (e.clientY - rect.top) / rect.height
    const rotateY = (px - 0.5) * MAX_TILT_DEG * 2
    const rotateX = (0.5 - py) * MAX_TILT_DEG * 2
    el.style.transform = `perspective(600px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`
  }

  function handleMouseLeave() {
    const el = ref.current
    if (el) el.style.transform = ''
  }

  return (
    <div
      ref={ref}
      onMouseMove={reducedMotion ? undefined : handleMouseMove}
      onMouseLeave={reducedMotion ? undefined : handleMouseLeave}
      className={className}
      style={{ transition: 'transform 0.15s ease' }}
    >
      {children}
    </div>
  )
}
