'use client'

import { useT } from '@/lib/i18n/useT'

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
  return (
    <div className="relative mx-auto w-full max-w-sm" aria-hidden="true">
      {/* Phone showing the SMS every employee receives */}
      <div className="rounded-[2rem] border border-zinc-200 bg-white p-4 shadow-xl">
        <div className="rounded-2xl bg-zinc-50 p-4">
          <p className="text-xs font-medium text-zinc-400">GiftFlow</p>
          <div className="mt-2 rounded-2xl rounded-ss-sm bg-white p-4 shadow-sm">
            <p className="text-sm text-zinc-800">{t('Hi Dana! Your holiday gift is waiting 🎁')}</p>
            <p className="mt-1 text-sm text-zinc-500">{t('Show this code at the event:')}</p>
            <div className="relative mt-3 flex justify-center overflow-hidden py-2 text-zinc-900">
              <FakeQr />
              <div className="animate-scan-line absolute inset-x-6 top-1/2 h-0.5 rounded bg-brand/70 motion-reduce:hidden" />
            </div>
          </div>
        </div>
      </div>
      {/* Floating live-dashboard card — the HR side of the same moment.
          On mobile there's no room beside the phone, so it stacks below. */}
      <div className="mt-4 w-full rounded-2xl border border-zinc-100 bg-white p-4 shadow-2xl sm:absolute sm:-bottom-6 sm:-end-8 sm:mt-0 sm:w-56">
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
          312<span className="text-base font-medium text-zinc-400"> / 500</span>
        </p>
        <p className="text-xs text-zinc-500">{t('gifts redeemed')}</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-100">
          <div className="h-full w-[62%] rounded-full bg-brand" />
        </div>
      </div>
    </div>
  )
}
