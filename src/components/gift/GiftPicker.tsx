'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/useT'

const GIFT_COLORS = ['#6E8B74', '#C76D4A', '#E8B86D', '#5A8FB5', '#9B6B5C', '#8B6BA8']

type Gift = { id: string; name: string }

export function GiftPicker({ token, gifts }: { token: string; gifts: Gift[] }) {
  const router = useRouter()
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function choose(giftId: string) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/gift/${token}/choose`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ giftId }),
      })
      const data = await res.json()
      if (!data.ok) {
        setError(t('Could not save your choice. Please try again.'))
        setBusy(false)
        return
      }
      // Re-render the server page, which now shows the locked choice + QR.
      router.refresh()
    } catch {
      setError(t('Could not save your choice. Please try again.'))
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-zinc-500 mb-2">{t('Choose your gift')}</p>
      {gifts.map((gift, i) => (
        <button
          key={gift.id}
          onClick={() => choose(gift.id)}
          disabled={busy}
          className="w-full py-4 rounded-2xl text-white text-lg font-semibold disabled:opacity-50 active:scale-95 transition-transform"
          style={{ backgroundColor: GIFT_COLORS[i % GIFT_COLORS.length] }}
        >
          {gift.name}
        </button>
      ))}
      {error && <p className="text-sm text-red-500 mt-2">{error}</p>}
    </div>
  )
}
