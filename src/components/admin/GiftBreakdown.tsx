'use client'

import { useT } from '@/lib/i18n/useT'
import type { GiftOption } from '@/types'
import { giftDistribution } from '@/lib/gift-distribution'

const GIFT_COLORS = ['#6366f1', '#8b5cf6', '#f59e0b', '#14b8a6', '#f43f5e', '#f97316']

type TokenSlice = { redeemed: boolean; gift_id: string | null }

type Props = {
  gifts: GiftOption[]
  tokens: TokenSlice[]
}

export function GiftBreakdown({ gifts, tokens }: Props) {
  const t = useT()
  if (gifts.length < 2 || tokens.length === 0) return null

  const { rows, unchosen, total } = giftDistribution(gifts, tokens)

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      <h2 className="font-semibold text-zinc-900 mb-3">{t('Gift Breakdown')}</h2>
      <div className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <div key={row.id} className="flex items-center gap-3">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: GIFT_COLORS[i % GIFT_COLORS.length] }}
            />
            <span className="flex-1 text-sm text-zinc-700 truncate">{row.name}</span>
            <span className="text-sm font-medium text-zinc-900 tabular-nums">{row.count}</span>
            <span className="text-xs text-zinc-400 w-10 text-right tabular-nums">{row.pct}%</span>
          </div>
        ))}
        {unchosen > 0 && (
          <div className="flex items-center gap-3">
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-300 flex-shrink-0" />
            <span className="flex-1 text-sm text-zinc-400">{t('Not chosen yet')}</span>
            <span className="text-sm font-medium text-zinc-400 tabular-nums">{unchosen}</span>
            <span className="text-xs text-zinc-300 w-10 text-right tabular-nums">
              {total > 0 ? Math.round((unchosen / total) * 100) : 0}%
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
