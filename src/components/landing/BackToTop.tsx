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
