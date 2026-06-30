'use client'

import { useT } from '@/lib/i18n/useT'
import type { CreditTransactionType } from '@/types'

type Transaction = {
  id: string
  amount: number
  type: CreditTransactionType
  description: string | null
  created_at: string
}

type Props = {
  transactions: Transaction[]
}

export function CreditTransactionHistory({ transactions }: Props) {
  const t = useT()

  const TYPE_STYLES: Record<CreditTransactionType, { label: string; color: string; sign: string }> = {
    purchase: { label: t('Purchase'), color: 'bg-emerald-100 text-emerald-700', sign: '+' },
    grant:    { label: t('Grant'), color: 'bg-violet-100 text-violet-700', sign: '+' },
    use:      { label: t('Used'), color: 'bg-zinc-100 text-zinc-600', sign: '-' },
    refund:   { label: t('Refund'), color: 'bg-blue-100 text-blue-700', sign: '+' },
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center py-12 bg-white rounded-xl border border-zinc-200">
        <p className="text-sm text-zinc-400">{t('No transactions yet')}</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-zinc-200 rounded-xl overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="border-b border-zinc-100">
            <th className="text-start text-xs font-medium text-zinc-400 uppercase tracking-wide px-5 py-3">{t('Date')}</th>
            <th className="text-start text-xs font-medium text-zinc-400 uppercase tracking-wide px-5 py-3">{t('Type')}</th>
            <th className="text-start text-xs font-medium text-zinc-400 uppercase tracking-wide px-5 py-3">{t('Description')}</th>
            <th className="text-end text-xs font-medium text-zinc-400 uppercase tracking-wide px-5 py-3">{t('Amount')}</th>
          </tr>
        </thead>
        <tbody>
          {transactions.map((tx) => {
            const style = TYPE_STYLES[tx.type]
            return (
              <tr key={tx.id} className="border-b border-zinc-50 last:border-0 hover-brand transition-colors">
                <td className="px-5 py-3 text-sm text-zinc-600">
                  {new Date(tx.created_at).toLocaleString(undefined, {
                    day: '2-digit',
                    month: '2-digit',
                    year: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false,
                  })}
                </td>
                <td className="px-5 py-3">
                  <span className={`text-xs font-medium px-2 py-1 rounded-full ${style.color}`}>
                    {style.label}
                  </span>
                </td>
                <td className="px-5 py-3 text-sm text-zinc-600">
                  {tx.description ?? '—'}
                </td>
                <td className="px-5 py-3 text-sm font-semibold text-end">
                  <span className={tx.type === 'use' ? 'text-zinc-600' : tx.type === 'grant' ? 'text-violet-600' : 'text-emerald-600'}>
                    {style.sign}{tx.amount.toLocaleString()}
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
