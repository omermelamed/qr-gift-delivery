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
