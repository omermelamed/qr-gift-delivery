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
