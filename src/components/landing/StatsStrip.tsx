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
