'use client'

import { useState } from 'react'
import { ResultCard } from '@/components/verify/ResultCard'
import { VerifyArrivalCount } from '@/components/verify/VerifyArrivalCount'
import { useT } from '@/lib/i18n/useT'
import type { GiftOption } from '@/types'

const GIFT_COLORS = ['#6E8B74', '#C76D4A', '#E8B86D', '#5A8FB5', '#9B6B5C', '#8B6BA8']

type RedeemResult =
  | { ok: true; employeeName: string; giftName: string | null }
  | { ok: false; reason?: string; employeeName?: string }

// Distributor fallback for the QR-link redemption path: when a multi-gift
// campaign token has no employee choice, let the distributor pick which gift was
// handed over. Redeems through the same /api/verify/[token] route the camera
// scanner uses, so both scan paths share one redemption + gift flow.
export function VerifyGiftPicker({
  token,
  employeeName,
  gifts,
}: {
  token: string
  employeeName: string
  gifts: GiftOption[]
}) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<RedeemResult | null>(null)
  // Arrival campaign that's also multi-gift: after the gift, hand off to the count step.
  const [arrival, setArrival] = useState<{ plannedCount: number; giftId: string } | null>(null)

  async function pick(giftId: string) {
    if (busy) return
    setBusy(true)
    try {
      const res = await fetch(`/api/verify/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ giftId }),
      })
      const r = await res.json()
      if (r.valid && r.needsArrivalCount) {
        setArrival({ plannedCount: r.plannedCount, giftId })
      } else if (r.valid) {
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

  if (arrival) {
    return (
      <VerifyArrivalCount
        token={token}
        employeeName={employeeName}
        plannedCount={arrival.plannedCount}
        giftId={arrival.giftId}
      />
    )
  }

  if (result?.ok) {
    return (
      <ResultCard
        icon="✓"
        color="green"
        title={result.employeeName}
        subtitle="Gift collected!"
        rawTitle
        giftName={result.giftName}
      />
    )
  }
  if (result && !result.ok) {
    if (result.reason === 'already_used') {
      return (
        <ResultCard
          icon="✗"
          color="red"
          title="Already claimed"
          subtitlePrefix={result.employeeName}
          subtitle="already redeemed this gift."
        />
      )
    }
    return <ResultCard icon="✗" color="red" title="Could not verify" subtitle="Try again" />
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-900 px-6 py-12">
      <p className="text-white/60 text-sm text-center mb-1">{t('Scanning for')}</p>
      <p className="text-white text-3xl font-bold text-center mb-8">{employeeName}</p>
      <p className="text-white/80 text-base font-medium text-center mb-5">
        {t('Which gift did they take?')}
      </p>
      <div className="flex flex-col gap-3 w-full max-w-sm">
        {gifts.map((gift, i) => (
          <button
            key={gift.id}
            onClick={() => pick(gift.id)}
            disabled={busy}
            className="w-full py-5 rounded-2xl text-white text-lg font-semibold disabled:opacity-50 active:scale-95 transition-transform"
            style={{ backgroundColor: GIFT_COLORS[i % GIFT_COLORS.length] }}
          >
            {gift.name}
          </button>
        ))}
      </div>
    </main>
  )
}
