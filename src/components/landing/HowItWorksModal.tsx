'use client'

import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { useT } from '@/lib/i18n/useT'
import { QrMark } from './Marks'
import { FeatureIcon } from './FeatureIcon'
import { STEPS } from './steps'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

const SCENE_COUNT = STEPS.length
const SCENE_DURATION = 2600
const CSV_ROW_WIDTHS = [72, 88, 56, 96, 64]

function CsvScene({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full flex-col justify-center gap-4">
      <div className="grid gap-1.5">
        {CSV_ROW_WIDTHS.map((w, i) => (
          <div
            key={i}
            className="rise h-3 rounded bg-white/15"
            style={{ width: `${w}%`, animationDelay: `${i * 90}ms` }}
          />
        ))}
      </div>
      <div>
        <h3 className="rise text-lg font-semibold" style={{ animationDelay: '520ms' }}>
          {title}
        </h3>
        <p className="rise mt-1 text-sm text-white/60" style={{ animationDelay: '580ms' }}>
          {body}
        </p>
      </div>
    </div>
  )
}

function QrScene({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <div className="pop rounded-2xl rounded-ss-sm bg-white/10 px-6 py-5">
        <QrMark className="pop h-12 w-12 text-white" />
      </div>
      <div>
        <h3 className="rise text-lg font-semibold">{title}</h3>
        <p className="rise mt-1 text-sm text-white/60">{body}</p>
      </div>
    </div>
  )
}

function ScanScene({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
      <span className="pop relative flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 text-white">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-2xl bg-white/20" aria-hidden="true" />
        <FeatureIcon name="scan" />
      </span>
      <div>
        <h3 className="rise text-lg font-semibold">{title}</h3>
        <p className="rise mt-1 text-sm text-white/60">{body}</p>
      </div>
    </div>
  )
}

function EndCard({
  t,
  onReplay,
  onTalkToTeam,
}: {
  t: (key: string) => string
  onReplay: () => void
  onTalkToTeam: () => void
}) {
  return (
    <div className="pop flex h-full flex-col items-center justify-center gap-5 text-center">
      <div>
        <h3 className="text-xl font-semibold">{t("That's the whole flow.")}</h3>
        <p className="mt-2 max-w-sm text-sm text-white/60">
          {t('Upload a list, we handle the SMS and the scanning — you just watch the gifts go out.')}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={onReplay}
          className="rounded-full border border-white/20 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
        >
          {t('Replay')}
        </button>
        <button
          type="button"
          onClick={onTalkToTeam}
          className="rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          {t('Talk to our team')}
        </button>
      </div>
    </div>
  )
}

// Self-contained animated placeholder for the "how it works" walkthrough —
// there is no real marketing video yet. The `videoSrc` prop is the future
// drop-in seam: once real footage exists, pass its URL and this component
// renders a real <video> instead of the animated scenes below.
export function HowItWorksModal({
  open,
  onClose,
  videoSrc,
}: {
  open: boolean
  onClose: () => void
  videoSrc?: string
}) {
  const t = useT()
  const [phase, setPhase] = useState(0) // 0..SCENE_COUNT-1 = scenes, SCENE_COUNT = end card
  const reducedMotion = usePrefersReducedMotion()
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)

  // Always start from the first scene when the modal opens. Adjusted during
  // render (React's documented pattern for "reset state when a prop
  // changes") rather than in an effect, so there's no extra render pass.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) setPhase(0)
  }

  // Focus management, Escape-to-close, and a body scroll lock while open.
  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    closeButtonRef.current?.focus()
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = prevOverflow
      previouslyFocused.current?.focus()
    }
  }, [open, onClose])

  // Auto-advance through the scenes onto the end card. Skipped under reduced
  // motion — content stays reachable via the dots below instead of a timer.
  useEffect(() => {
    if (!open || reducedMotion || phase >= SCENE_COUNT) return
    const timer = setTimeout(() => setPhase((p) => p + 1), SCENE_DURATION)
    return () => clearTimeout(timer)
  }, [open, phase, reducedMotion])

  if (!open) return null

  function handleBackdropClick(e: MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose()
  }

  function handleTalkToTeam() {
    onClose()
    requestAnimationFrame(() => {
      document.getElementById('contact')?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' })
    })
  }

  const scenes = [CsvScene, QrScene, ScanScene]
  const ActiveScene = scenes[phase]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={handleBackdropClick}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('How GiftFlow works')}
        className="pop relative w-full max-w-xl overflow-hidden rounded-2xl bg-zinc-900 text-white shadow-2xl"
      >
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label={t('Close video')}
          className="absolute end-3 top-3 z-10 rounded-full bg-white/10 p-2 text-white/80 transition hover:bg-white/20 hover:text-white"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="aspect-[16/10] w-full">
          {videoSrc ? (
            <video src={videoSrc} controls className="h-full w-full bg-black" />
          ) : reducedMotion ? (
            // Reduced motion: no slideshow/timer — every scene plus the end
            // card renders statically so nothing is only reachable by waiting.
            <div className="flex h-full flex-col justify-center gap-5 overflow-y-auto p-6 sm:p-8">
              {STEPS.map((step) => (
                <div key={step.title} className="flex items-center gap-4">
                  <QrMark className="h-6 w-6 shrink-0 text-white/70" />
                  <div>
                    <h3 className="text-sm font-semibold">{t(step.title)}</h3>
                    <p className="mt-0.5 text-xs text-white/60">{t(step.body)}</p>
                  </div>
                </div>
              ))}
              <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-white/10 pt-4">
                <p className="text-sm text-white/60">{t("That's the whole flow.")}</p>
                <button
                  type="button"
                  onClick={handleTalkToTeam}
                  className="ms-auto rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
                >
                  {t('Talk to our team')}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col justify-center p-6 sm:p-8">
              {phase < SCENE_COUNT ? (
                <ActiveScene title={t(STEPS[phase].title)} body={t(STEPS[phase].body)} />
              ) : (
                <EndCard t={t} onReplay={() => setPhase(0)} onTalkToTeam={handleTalkToTeam} />
              )}
            </div>
          )}
        </div>

        {!videoSrc && !reducedMotion && phase < SCENE_COUNT && (
          <div className="border-t border-white/10 bg-black/30 px-6 py-4 sm:px-8">
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/10">
              <div
                key={phase}
                className="bar-grow h-full rounded-full bg-brand"
                style={{ animationDuration: `${SCENE_DURATION}ms`, animationDelay: '0s', animationTimingFunction: 'linear' }}
              />
            </div>
            <div className="mt-3 flex items-center justify-center gap-2">
              {STEPS.map((step, i) => (
                <button
                  key={step.title}
                  type="button"
                  onClick={() => setPhase(i)}
                  aria-label={t(step.title)}
                  aria-current={phase === i}
                  className={`h-1.5 w-6 rounded-full transition-colors ${
                    phase === i ? 'bg-brand' : 'bg-white/20 hover:bg-white/35'
                  }`}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
