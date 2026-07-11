'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useT } from '@/lib/i18n/useT'
import { QrMark, PlayIcon } from './Marks'

const SECTION_IDS = ['how-it-works', 'why', 'contact'] as const

export function LandingNav({ onOpenVideo }: { onOpenVideo: () => void }) {
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
          <button
            type="button"
            onClick={onOpenVideo}
            className="flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 motion-safe:hover:-translate-y-px"
          >
            <PlayIcon />
            {t('Watch how it works')}
          </button>
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
