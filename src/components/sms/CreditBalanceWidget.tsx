'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n/useT'
import { CreditPurchaseModal } from './CreditPurchaseModal'

type Props = {
  balance: number
  totalPurchased: number
  totalUsed: number
}

export function CreditBalanceWidget({ balance, totalPurchased, totalUsed }: Props) {
  const t = useT()
  const [showPurchase, setShowPurchase] = useState(false)
  const usagePct = totalPurchased > 0 ? Math.round((totalUsed / totalPurchased) * 100) : 0

  const balanceColor =
    balance === 0 ? 'text-red-600' :
    balance < 50 ? 'text-amber-600' :
    'text-emerald-600'

  return (
    <>
      <div className="bg-white border border-zinc-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-zinc-500 uppercase tracking-wide">{t('SMS Credits')}</h3>
          <button
            onClick={() => setShowPurchase(true)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white hover:brightness-110 transition-all"
            style={{ backgroundColor: 'var(--brand, #6366f1)' }}
          >
            {t('Buy More')}
          </button>
        </div>

        <div className="flex items-baseline gap-2 mb-4">
          <span className={`text-3xl font-bold ${balanceColor}`}>
            {balance.toLocaleString()}
          </span>
          <span className="text-sm text-zinc-400">{t('remaining')}</span>
        </div>

        {totalPurchased > 0 && (
          <>
            <div className="h-2 bg-zinc-100 rounded-full overflow-hidden mb-3">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${usagePct}%`,
                  backgroundColor: usagePct > 90 ? '#dc2626' : usagePct > 70 ? '#d97706' : 'var(--brand, #6366f1)',
                }}
              />
            </div>
            <div className="flex justify-between text-xs text-zinc-400">
              <span>{totalUsed.toLocaleString()} {t('used')}</span>
              <span>{totalPurchased.toLocaleString()} {t('purchased')}</span>
            </div>
          </>
        )}

        {balance === 0 && totalPurchased === 0 && (
          <p className="text-sm text-zinc-400">
            {t('Purchase credits to start sending SMS campaigns.')}
          </p>
        )}
      </div>

      {showPurchase && (
        <CreditPurchaseModal onClose={() => setShowPurchase(false)} />
      )}
    </>
  )
}
