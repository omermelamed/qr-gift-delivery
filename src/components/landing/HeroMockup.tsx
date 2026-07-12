'use client'

import { useEffect, useState } from 'react'
import { useT } from '@/lib/i18n/useT'
import { CountUp } from './CountUp'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'

const TOTAL = 500
const SETTLED_COUNT = 312
// Matches CountUp's startDelay + duration for the initial 0→312 run, so the
// tap interaction only takes over once that animation has actually settled.
const SETTLE_DELAY_MS = 2400 + 1200
const TAP_SWEEP_MS = 700
const TOAST_MS = 1400

// Deterministic decorative "QR" — three finder patterns plus scattered modules.
const MODULES: Array<[number, number]> = [
  [8, 1], [9, 2], [8, 3], [10, 4], [4, 4], [5, 4], [4, 5], [6, 6], [5, 7],
  [9, 8], [10, 9], [8, 9], [4, 9], [5, 10], [2, 8], [1, 9], [6, 9], [9, 5],
  [10, 6], [6, 4], [4, 7], [7, 7],
]

function Finder({ x, y }: { x: number; y: number }) {
  return (
    <g>
      <rect x={x} y={y} width="3" height="3" fill="currentColor" />
      <rect x={x + 0.6} y={y + 0.6} width="1.8" height="1.8" fill="white" />
      <rect x={x + 1.1} y={y + 1.1} width="0.8" height="0.8" fill="currentColor" />
    </g>
  )
}

function FakeQr() {
  return (
    <svg viewBox="0 0 11 11" className="h-24 w-24" aria-hidden="true">
      <Finder x={0} y={0} />
      <Finder x={8} y={0} />
      <Finder x={0} y={8} />
      {MODULES.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" />
      ))}
    </svg>
  )
}

export function HeroMockup() {
  const t = useT()
  const reducedMotion = usePrefersReducedMotion()
  const [count, setCount] = useState(SETTLED_COUNT)
  const [settled, setSettled] = useState(false)
  const [scanning, setScanning] = useState(false)
  // True by default: irrelevant until `settled`, and the moment settle
  // happens we want the badge already showing (matching the entrance state)
  // with no extra render round-trip that could flicker it invisible first.
  const [showToast, setShowToast] = useState(true)
  const [tapSweepKey, setTapSweepKey] = useState(0)

  useEffect(() => {
    const timer = setTimeout(() => setSettled(true), reducedMotion ? 0 : SETTLE_DELAY_MS)
    return () => clearTimeout(timer)
  }, [reducedMotion])

  const exhausted = count >= TOTAL

  function handleTap() {
    if (!settled || scanning || exhausted) return
    setScanning(true)
    setTapSweepKey((k) => k + 1)

    const applyRedeem = () => {
      setCount((c) => Math.min(c + 1, TOTAL))
      setShowToast(true)
      setScanning(false)
      window.setTimeout(() => setShowToast(false), TOAST_MS)
    }

    if (reducedMotion) {
      applyRedeem()
    } else {
      window.setTimeout(applyRedeem, TAP_SWEEP_MS)
    }
  }

  function handleReset() {
    setCount(SETTLED_COUNT)
    setShowToast(false)
  }

  const percent = Math.round((count / TOTAL) * 100)

  return (
    <div className="relative mx-auto w-full max-w-sm">
      {/* Phone showing the SMS every employee receives */}
      <div className="rise rise-d2 rounded-[2rem] border border-zinc-200 bg-white p-4 shadow-xl">
        <div className="rounded-2xl bg-zinc-50 p-4">
          <p className="text-xs font-medium text-zinc-400">GiftFlow</p>
          <div className="relative mt-2 rounded-2xl rounded-ss-sm bg-white p-4 shadow-sm">
            {/* Typing indicator — overlays, then fades as the message appears */}
            <div className="sms-typing absolute start-4 top-4 flex gap-1 opacity-0" aria-hidden="true">
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" />
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" />
              <span className="h-1.5 w-1.5 rounded-full bg-zinc-300" />
            </div>
            <div className="sms-msg">
              <p className="text-sm text-zinc-800">{t('Hi Dana! Your holiday gift is waiting 🎁')}</p>
              <p className="mt-1 text-sm text-zinc-500">{t('Show this code at the event:')}</p>
              <div className="relative mt-3 flex overflow-hidden py-2 text-zinc-900">
                <button
                  type="button"
                  onClick={handleTap}
                  disabled={exhausted}
                  aria-label={t('Tap to simulate a scan')}
                  className="rounded-lg transition motion-safe:hover:scale-[1.03] motion-safe:active:scale-[0.97] disabled:cursor-not-allowed"
                >
                  <FakeQr />
                </button>
                {/* One-shot entrance sweep — untouched. Width/position matches
                    the QR (start-0 w-24), which is now start-aligned rather
                    than centered — see the flex container above. */}
                <div className="scan-once absolute start-0 top-1/2 h-0.5 w-24 rounded opacity-0 motion-reduce:hidden" />
                {/* Tap-triggered sweep — remounted via key on every tap so the animation replays. */}
                {tapSweepKey > 0 && !reducedMotion && (
                  <div key={tapSweepKey} className="tap-scan-sweep absolute start-0 top-1/2 h-0.5 w-24 rounded" aria-hidden="true" />
                )}
              </div>
              <p className="text-brand mt-1 flex items-center gap-1 text-xs font-medium">
                {!exhausted && (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3 w-3 shrink-0"
                    aria-hidden="true"
                  >
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                )}
                {exhausted ? t('All gifts redeemed') : t('Tap to simulate a scan')}
              </p>
            </div>
          </div>
        </div>
      </div>
      {/* Floating live-dashboard card — the HR side of the same moment.
          On mobile there's no room beside the phone, so it stacks below. */}
      <div className="pop d-hero-card mt-4 w-full rounded-2xl border border-zinc-100 bg-white p-4 shadow-2xl sm:absolute sm:-bottom-6 sm:-end-8 sm:mt-0 sm:w-56">
        {/* Redeemed toast — lands after the counter settles (original one-shot
            CSS animation, untouched), then re-flashes on each tap. Once settled,
            the `toast-in` class is dropped so JS-driven opacity can take over —
            CSS animation effects always outrank inline styles while active, so
            controlling visibility after the animation completes needs the class
            gone, not just an inline override layered on top of it. */}
        <div
          className={`absolute -top-3 end-3 flex items-center gap-1 rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-semibold text-white shadow-md ${
            settled ? '' : 'toast-in'
          }`}
          style={
            settled
              ? { opacity: showToast ? 1 : 0, transition: reducedMotion ? 'none' : 'opacity 0.25s ease' }
              : undefined
          }
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="h-3 w-3" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          {t('Redeemed')}
        </div>
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-zinc-500">{t('Holiday campaign')}</p>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75 motion-reduce:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            {t('Live')}
          </span>
        </div>
        <p className="font-display mt-2 text-2xl font-bold">
          {settled ? count : <CountUp to={SETTLED_COUNT} startDelay={2400} />}
          <span className="text-base font-medium text-zinc-400"> / {TOTAL}</span>
        </p>
        <p className="text-xs text-zinc-500">{t('gifts redeemed')}</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
          <div
            className="bar-grow bar-live h-full rounded-full bg-brand"
            style={settled ? { width: `${percent}%` } : { width: '62%' }}
          />
        </div>
        {settled && (
          <button
            type="button"
            onClick={handleReset}
            disabled={count === SETTLED_COUNT}
            className="bg-brand-soft text-brand mt-3.5 w-full rounded-lg py-2 text-xs font-semibold transition hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('Reset demo')}
          </button>
        )}
      </div>
    </div>
  )
}
