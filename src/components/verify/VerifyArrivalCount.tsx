'use client'

import { useState } from 'react'
import { ResultCard } from '@/components/verify/ResultCard'
import { useT } from '@/lib/i18n/useT'

type RedeemResult =
  | { ok: true; employeeName: string; giftName: string | null }
  | { ok: false; reason?: string; employeeName?: string }

// QR-link counterpart of the camera scanner's arrival-count step: the distributor
// records how many people actually arrived before the token is redeemed. Posts to
// the same /api/verify/[token] route. `giftId` is passed through for the rare
// multi-gift + arrival combo (after the gift was picked).
export function VerifyArrivalCount({
  token,
  employeeName,
  plannedCount,
  giftId = null,
}: {
  token: string
  employeeName: string
  plannedCount: number
  giftId?: string | null
}) {
  const t = useT()
  const [count, setCount] = useState(plannedCount)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<RedeemResult | null>(null)

  async function confirm() {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/verify/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ arrivedCount: count, ...(giftId ? { giftId } : {}) }),
      })
      const r = await res.json()
      if (r.valid) {
        setResult({ ok: true, employeeName: r.employeeName, giftName: r.giftName ?? null })
      } else {
        setResult({ ok: false, reason: r.reason, employeeName: r.employeeName })
        setBusy(false)
      }
    } catch {
      setResult({ ok: false, reason: 'invalid' })
      setBusy(false)
    }
  }

  if (result?.ok) {
    return <ResultCard icon="✓" color="green" title={result.employeeName} subtitle="Gift collected!" rawTitle giftName={result.giftName} />
  }
  if (result && !result.ok) {
    if (result.reason === 'already_used') {
      return <ResultCard icon="✗" color="red" title="Already claimed" subtitlePrefix={result.employeeName} subtitle="already redeemed this gift." />
    }
    return <ResultCard icon="✗" color="red" title="Could not verify" subtitle="Try again" />
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-900 px-6 py-12">
      <p className="text-white/60 text-sm text-center mb-1">{t('Handing over to')}</p>
      <p className="text-white text-3xl font-bold text-center mb-1">{employeeName}</p>
      <p className="text-white/50 text-xs text-center mb-8">{t('Planned')}: {plannedCount}</p>
      <p className="text-white/80 text-base font-medium text-center mb-6">{t('How many people arrived?')}</p>
      <div className="flex items-center justify-center gap-8 mb-10">
        <button onClick={() => setCount((c) => Math.max(1, c - 1))} disabled={busy || count <= 1} aria-label={t('Fewer')} className="w-16 h-16 rounded-full bg-zinc-800 text-white text-3xl flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform">−</button>
        <span className="text-white text-6xl font-bold tabular-nums w-24 text-center">{count}</span>
        <button onClick={() => setCount((c) => c + 1)} disabled={busy} aria-label={t('More')} className="w-16 h-16 rounded-full bg-indigo-600 text-white text-3xl flex items-center justify-center disabled:opacity-40 active:scale-95 transition-transform">+</button>
      </div>
      <button onClick={confirm} disabled={busy} className="w-full max-w-sm py-4 bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-lg font-semibold rounded-2xl disabled:opacity-50 active:scale-95 transition-transform">
        {busy ? t('Saving…') : t('Confirm handover')}
      </button>
    </main>
  )
}
