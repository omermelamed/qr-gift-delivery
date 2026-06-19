'use client'

import { useT } from '@/lib/i18n/useT'
import { CreditBalanceWidget } from './CreditBalanceWidget'
import { CreditTransactionHistory } from './CreditTransactionHistory'
import type { CreditTransactionType } from '@/types'

type Transaction = {
  id: string
  amount: number
  type: CreditTransactionType
  description: string | null
  created_at: string
}

type Props = {
  credits: { total_purchased: number; total_used: number; balance: number }
  transactions: Transaction[]
}

export function CreditsPageUI({ credits, transactions }: Props) {
  const t = useT()

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-zinc-900 mb-6">{t('SMS Credits')}</h1>

      <div className="mb-8">
        <CreditBalanceWidget
          balance={credits.balance}
          totalPurchased={credits.total_purchased}
          totalUsed={credits.total_used}
        />
      </div>

      <h2 className="text-lg font-semibold text-zinc-900 mb-4">{t('Transaction History')}</h2>
      <CreditTransactionHistory transactions={transactions} />
    </div>
  )
}
