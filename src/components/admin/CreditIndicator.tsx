'use client'

import Link from 'next/link'
import { useT } from '@/lib/i18n/useT'

type Props = {
  balance: number
  needed?: number
  label?: string
}

export function CreditIndicator({ balance, needed, label }: Props) {
  const t = useT()

  const isLow = balance <= 10
  const isWarning = balance > 10 && balance <= 30
  const insufficient = needed !== undefined && needed > 0 && balance < needed

  return (
    <div
      className={`flex items-center justify-between rounded-xl p-4 mb-4 border ${
        insufficient || isLow
          ? 'bg-red-50 border-red-200'
          : isWarning
            ? 'bg-amber-50 border-amber-200'
            : 'bg-emerald-50 border-emerald-200'
      }`}
    >
      <div className="flex items-center gap-3">
        <svg className="w-5 h-5 flex-shrink-0 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
        </svg>
        <span className={`text-2xl font-bold ${
          insufficient || isLow ? 'text-red-600' : isWarning ? 'text-amber-600' : 'text-emerald-600'
        }`}>
          {balance.toLocaleString()}
        </span>
        <span className="text-sm text-zinc-600">{t('SMS credits remaining')}</span>
      </div>
      <div className="flex items-center gap-3">
        {needed !== undefined && needed > 0 && (
          <span className="text-sm text-zinc-500">
            {insufficient
              ? `${t('Need')} ${needed}, ${t('have')} ${balance}`
              : `${balance - needed} ${t('after sending')}${label ? ` (${t(label)})` : ''}`}
          </span>
        )}
        <Link
          href="/admin/sms/credits"
          className="text-sm font-medium hover:underline"
          style={{ color: 'var(--brand, #6366f1)' }}
        >
          {t('Manage')}
        </Link>
      </div>
    </div>
  )
}
