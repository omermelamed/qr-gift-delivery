'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { useT } from '@/lib/i18n/useT'
import { HeroMockup } from './HeroMockup'

// The QR finder pattern — the square-in-square corner mark of every QR code —
// is the landing page's signature glyph.
export function QrMark({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-3 w-3 shrink-0 border-2 border-current p-[2px] ${className}`}
    >
      <span className="block h-full w-full bg-current" />
    </span>
  )
}

export function Eyebrow({
  children,
  className = 'text-brand',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <p className={`flex items-center gap-2 text-sm font-semibold uppercase tracking-widest ${className}`}>
      <QrMark />
      {children}
    </p>
  )
}

export function LandingPage() {
  const t = useT()
  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <header className="sticky top-0 z-40 border-b border-zinc-100 bg-white/80 backdrop-blur">
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="#top" className="font-display flex items-center gap-2 text-lg font-bold tracking-tight">
            <QrMark className="text-brand" />
            GiftFlow
          </a>
          <div className="flex items-center gap-3 sm:gap-6">
            <a href="#how-it-works" className="hidden text-sm font-medium text-zinc-600 hover:text-zinc-900 sm:block">
              {t('How it works')}
            </a>
            <a href="#why" className="hidden text-sm font-medium text-zinc-600 hover:text-zinc-900 sm:block">
              {t('Why GiftFlow')}
            </a>
            <Link href="/login" className="text-sm font-medium text-zinc-600 hover:text-zinc-900">
              {t('Log in')}
            </Link>
            <a
              href="#contact"
              className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90"
            >
              {t('Book a demo')}
            </a>
          </div>
        </nav>
      </header>

      <main id="top">
        <section className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div>
            <Eyebrow>{t('Employee gifting, scanned')}</Eyebrow>
            <h1 className="font-display mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
              {t('Gift day without the spreadsheet chaos')}
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-zinc-600">
              {t(
                'GiftFlow sends every employee a personal QR code by SMS. Your team scans at the event, and you watch redemptions live — no double handouts, no guesswork.'
              )}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-5">
              <a
                href="#contact"
                className="rounded-full bg-brand px-6 py-3 text-base font-semibold text-white shadow-md transition-opacity hover:opacity-90"
              >
                {t('Book a demo')}
              </a>
              <a href="#how-it-works" className="text-base font-semibold text-zinc-700 hover:text-zinc-900">
                {t('See how it works')} <span className="inline-block rtl:rotate-180">→</span>
              </a>
            </div>
          </div>
          <HeroMockup />
        </section>

        {/* Tasks 5–6 insert #how-it-works, #why and #contact sections here */}
      </main>

      <footer className="border-t border-zinc-100 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 sm:flex-row sm:px-6">
          <p className="font-display flex items-center gap-2 text-sm font-bold">
            <QrMark className="text-brand" />
            GiftFlow
          </p>
          <p className="text-sm text-zinc-500">{t('Employee gift distribution, scanned.')}</p>
          <div className="flex items-center gap-4 text-sm">
            <a href="#contact" className="text-zinc-600 hover:text-zinc-900">
              {t('Contact')}
            </a>
            <Link href="/login" className="text-zinc-600 hover:text-zinc-900">
              {t('Log in')}
            </Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
