'use client'

import { useT } from '@/lib/i18n/useT'

type Props = {
  rows: { userId: string; name: string; count: number }[]
  total: number
}

export function DistributorStatsView({ rows, total }: Props) {
  const t = useT()
  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      <h2 className="font-semibold text-zinc-900 mb-4">{t('Scanner Stats')}</h2>
      <div className="flex flex-col gap-2">
        {rows.map(({ userId, name, count }) => (
          <div key={userId} className="flex items-center justify-between text-sm">
            <span className="text-zinc-700 truncate">{name}</span>
            <span className="text-zinc-500 flex-shrink-0 ms-2">
              {count} {count !== 1 ? t('gifts') : t('gift')} · {total > 0 ? Math.round((count / total) * 100) : 0}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
