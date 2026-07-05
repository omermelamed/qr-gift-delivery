'use client'

import Link from 'next/link'
import { useT } from '@/lib/i18n/useT'
import { HeroMockup } from './HeroMockup'
import { ContactForm } from './ContactForm'
import { Reveal } from './Reveal'
import { QrMark, Eyebrow } from './Marks'

export { QrMark, Eyebrow } from './Marks'

const STEPS = [
  {
    title: 'Upload your employee list',
    body: 'A CSV file is all it takes — your campaign is ready in minutes.',
  },
  {
    title: 'Everyone gets a personal QR',
    body: 'Sent by SMS. Nothing to install, nothing to print.',
  },
  {
    title: 'Scan and watch it live',
    body: 'Each code redeems exactly once, and the dashboard updates as gifts are handed out.',
  },
]

const FEATURES = [
  {
    title: 'One scan, one gift',
    body: 'A code can never be redeemed twice — validation is atomic at the database level.',
  },
  {
    title: 'Live dashboard',
    body: 'See every redemption the moment it happens, from any device.',
  },
  {
    title: 'Nothing to install',
    body: 'Employees just open a text message. Scanners use any phone camera.',
  },
  {
    title: 'Scan as a team',
    body: 'The whole team can scan in parallel — everyone sees the same live state.',
  },
  {
    title: 'Hebrew and English',
    body: 'Full right-to-left support across the product, for employees and admins alike.',
  },
  {
    title: 'Per-campaign reports',
    body: 'Export exactly who picked up what, when, and who handed it out.',
  },
]

export function LandingPage() {
  const t = useT()
  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <noscript>
        <style>{`[data-reveal]{opacity:1 !important;transform:none !important}`}</style>
      </noscript>
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
              className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 motion-safe:hover:-translate-y-px"
            >
              {t('Book a demo')}
            </a>
          </div>
        </nav>
      </header>

      <main id="top">
        <section className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(55%_45%_at_72%_18%,rgba(99,102,241,0.09),transparent)]" />
          <div>
            <Eyebrow className="rise text-brand">{t('Employee gifting, scanned')}</Eyebrow>
            <h1 className="font-display rise rise-d1 mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
              {t('Gift day without the spreadsheet chaos')}
            </h1>
            <p className="rise rise-d2 mt-5 max-w-xl text-lg leading-relaxed text-zinc-600">
              {t(
                'GiftFlow sends every employee a personal QR code by SMS. Your team scans at the event, and you watch redemptions live — no double handouts, no guesswork.'
              )}
            </p>
            <div className="rise rise-d3 mt-8 flex flex-wrap items-center gap-5">
              <a
                href="#contact"
                className="rounded-full bg-brand px-6 py-3 text-base font-semibold text-white shadow-md transition hover:opacity-90 motion-safe:hover:-translate-y-px"
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

        <section id="how-it-works" className="border-y border-zinc-100 bg-zinc-50">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
            <Reveal>
              <Eyebrow>{t('How it works')}</Eyebrow>
              <h2 className="font-display mt-3 text-3xl font-bold tracking-tight">
                {t('From employee list to gift day in three steps')}
              </h2>
            </Reveal>
            <ol className="mt-10 grid gap-6 lg:grid-cols-3">
              {STEPS.map((step, i) => (
                <li key={step.title}>
                  <Reveal
                    delay={i * 100}
                    className="h-full rounded-2xl border border-zinc-100 bg-white p-6 shadow-sm hover:shadow-md motion-safe:hover:-translate-y-0.5"
                  >
                    <p className="font-display text-sm font-bold text-brand">{i + 1}</p>
                    <h3 className="mt-2 text-lg font-semibold">{t(step.title)}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-zinc-600">{t(step.body)}</p>
                  </Reveal>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="why" className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          <Reveal>
            <Eyebrow>{t('Why GiftFlow')}</Eyebrow>
            <h2 className="font-display mt-3 text-3xl font-bold tracking-tight">
              {t('Built for the day itself')}
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 50}>
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  <QrMark className="text-brand" />
                  {t(f.title)}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{t(f.body)}</p>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="contact" className="bg-indigo-950 text-white">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
            <Reveal>
              <Eyebrow className="text-indigo-300">{t('Book a demo')}</Eyebrow>
              <h2 className="font-display mt-3 text-3xl font-bold tracking-tight">
                {t('See your next gift day in GiftFlow')}
              </h2>
              <p className="mt-4 max-w-md leading-relaxed text-indigo-200/90">
                {t("Tell us about your next gift day and we'll show you GiftFlow in action.")}
              </p>
            </Reveal>
            <Reveal delay={100}>
              <ContactForm />
            </Reveal>
          </div>
        </section>
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
