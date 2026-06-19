'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/useT'
import { CREDIT_PACKAGES } from '@/types'

type Props = {
  onClose: () => void
}

export function CreditPurchaseModal({ onClose }: Props) {
  const t = useT()
  const router = useRouter()
  const [selected, setSelected] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePurchase() {
    if (!selected) return
    setLoading(true)
    setError(null)

    const res = await fetch('/api/sms/credits/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ packageName: selected }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? t('Something went wrong'))
      setLoading(false)
      return
    }

    router.refresh()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-bold text-zinc-900">{t('Buy SMS Credits')}</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 text-xl leading-none">
            &times;
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-6">
          {CREDIT_PACKAGES.map((pkg) => {
            const perMsg = (pkg.price / pkg.messages).toFixed(2)
            const isSelected = selected === pkg.name
            const discount = pkg.price < pkg.messages
              ? Math.round((1 - pkg.price / pkg.messages) * 100)
              : 0

            return (
              <button
                key={pkg.name}
                onClick={() => setSelected(pkg.name)}
                className={`relative border-2 rounded-xl p-4 text-left transition-all ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-zinc-200 hover:border-zinc-300'
                }`}
              >
                {discount > 0 && (
                  <span className="absolute -top-2 -right-2 bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    -{discount}%
                  </span>
                )}
                <p className="font-semibold text-zinc-900">{pkg.name}</p>
                <p className="text-2xl font-bold text-zinc-900 mt-1">
                  ₪{pkg.price}
                </p>
                <p className="text-xs text-zinc-400 mt-1">
                  {pkg.messages.toLocaleString()} {t('messages')} · ₪{perMsg}/{t('messages').charAt(0)}
                </p>
              </button>
            )
          })}
        </div>

        {error && (
          <p className="text-sm text-red-600 mb-4">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-lg border border-zinc-200 text-zinc-600 font-medium hover:bg-zinc-50 transition-colors"
          >
            {t('Cancel')}
          </button>
          <button
            onClick={handlePurchase}
            disabled={!selected || loading}
            className="flex-1 px-4 py-2.5 rounded-lg text-white font-semibold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--brand, #6366f1)' }}
          >
            {loading ? t('Processing...') : t('Purchase')}
          </button>
        </div>
      </div>
    </div>
  )
}
