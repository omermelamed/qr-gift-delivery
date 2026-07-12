'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useT } from '@/lib/i18n/useT'
import { HeroMockup } from './HeroMockup'
import { HeroAmbient } from './HeroAmbient'
import { ContactForm } from './ContactForm'
import { Reveal } from './Reveal'
import { QrMark, Eyebrow, PlayIcon } from './Marks'
import { LandingNav } from './LandingNav'
import { FeatureIcon, type FeatureIconName } from './FeatureIcon'
import { BackToTop } from './BackToTop'
import { StepRail } from './StepRail'
import { TiltCard } from './TiltCard'
import { HowItWorksModal } from './HowItWorksModal'

export { QrMark, Eyebrow } from './Marks'

const FEATURES: Array<{ title: string; body: string; icon: FeatureIconName }> = [
  {
    title: 'One scan, one gift',
    body: 'A code can never be redeemed twice — validation is atomic at the database level.',
    icon: 'scan',
  },
  {
    title: 'Live dashboard',
    body: 'See every redemption the moment it happens, from any device.',
    icon: 'activity',
  },
  {
    title: 'Nothing to install',
    body: 'Employees just open a text message. Scanners use any phone camera.',
    icon: 'phone',
  },
  {
    title: 'Scan as a team',
    body: 'The whole team can scan in parallel — everyone sees the same live state.',
    icon: 'users',
  },
  {
    title: 'Hebrew and English',
    body: 'Full right-to-left support across the product, for employees and admins alike.',
    icon: 'globe',
  },
  {
    title: 'Per-campaign reports',
    body: 'Export exactly who picked up what, when, and who handed it out.',
    icon: 'chart',
  },
]

export function LandingPage() {
  const t = useT()
  const [videoOpen, setVideoOpen] = useState(false)

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <noscript>
        <style>{`[data-reveal]{opacity:1 !important;transform:none !important}`}</style>
      </noscript>
      <LandingNav onOpenVideo={() => setVideoOpen(true)} />
      <HowItWorksModal open={videoOpen} onClose={() => setVideoOpen(false)} />

      <main id="top">
        <HeroAmbient className="relative z-0 bg-zinc-50">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
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
                <button
                  type="button"
                  onClick={() => setVideoOpen(true)}
                  className="hover-glow-brand flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-base font-semibold text-white shadow-md transition hover:opacity-90 motion-safe:hover:-translate-y-px"
                >
                  <PlayIcon className="h-3.5 w-3.5" />
                  {t('Watch how it works')}
                </button>
                <a href="#contact" className="text-base font-semibold text-zinc-700 hover:text-zinc-900">
                  {t('Talk to our team')} <span className="inline-block rtl:rotate-180">→</span>
                </a>
              </div>
            </div>
            <HeroMockup />
          </div>
        </HeroAmbient>

        <section id="how-it-works" className="scroll-mt-16 border-y border-zinc-100 bg-zinc-50">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
            <Reveal>
              <Eyebrow>{t('How it works')}</Eyebrow>
              <h2 className="font-display mt-3 text-3xl font-bold tracking-tight">
                {t('From employee list to gift day in three steps')}
              </h2>
            </Reveal>
            <StepRail />
          </div>
        </section>

        <section id="why" className="mx-auto max-w-6xl scroll-mt-16 px-4 py-16 sm:px-6 lg:py-24">
          <Reveal>
            <Eyebrow>{t('Why GiftFlow')}</Eyebrow>
            <h2 className="font-display mt-3 text-3xl font-bold tracking-tight">
              {t('Built for the day itself')}
            </h2>
          </Reveal>
          <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f, i) => (
              <Reveal key={f.title} delay={i * 50} className="group">
                <TiltCard>
                  <h3 className="flex items-center gap-3 text-base font-semibold">
                    <span className="feature-tile flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors duration-200">
                      <FeatureIcon name={f.icon} />
                    </span>
                    {t(f.title)}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600">{t(f.body)}</p>
                </TiltCard>
              </Reveal>
            ))}
          </div>
        </section>

        <section id="contact" className="bg-brand-panel scroll-mt-16 text-white">
          <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2 lg:py-24">
            <Reveal>
              <Eyebrow className="text-brand-panel-tint">{t('Get in touch')}</Eyebrow>
              <h2 className="font-display mt-3 text-3xl font-bold tracking-tight">
                {t('Bring GiftFlow to your next gift day')}
              </h2>
              <p className="text-on-brand-panel-muted mt-4 max-w-md leading-relaxed">
                {t("Tell us about your team and your next event — we'll set your first campaign up with you.")}
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
      <BackToTop />
    </div>
  )
}
