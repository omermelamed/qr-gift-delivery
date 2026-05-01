'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'

export function RedemptionProgress({
  campaignId,
  initialClaimed,
  total,
}: {
  campaignId: string
  initialClaimed: number
  total: number
}) {
  const [claimed, setClaimed] = useState(initialClaimed)

  useEffect(() => {
    if (total === 0) return
    const supabase = createClient()
    const channel = supabase
      .channel(`redemption-${campaignId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'gift_tokens', filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          if (payload.new?.redeemed === true && payload.old?.redeemed === false) {
            setClaimed((c) => Math.min(c + 1, total))
          }
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [campaignId, total])

  const pct = total === 0 ? 0 : Math.round((claimed / total) * 100)
  const pending = total - claimed

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5 flex items-center gap-6">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-5 mb-4">
          <div>
            <p className="text-3xl font-bold text-zinc-900">{claimed}</p>
            <p className="text-xs text-zinc-400 mt-0.5">Claimed</p>
          </div>
          <div className="w-px h-9 bg-zinc-100" />
          <div>
            <p className="text-3xl font-bold text-amber-500">{pending}</p>
            <p className="text-xs text-zinc-400 mt-0.5">Pending</p>
          </div>
          <div className="w-px h-9 bg-zinc-100" />
          <div>
            <p className="text-3xl font-bold text-zinc-300">{total}</p>
            <p className="text-xs text-zinc-400 mt-0.5">Total</p>
          </div>
        </div>
        <div className="w-full bg-zinc-100 rounded-full h-2.5">
          <div
            className="h-2.5 rounded-full transition-all duration-500"
            style={{ width: `${pct}%`, backgroundColor: 'var(--brand,#6366f1)' }}
          />
        </div>
        <p className="text-xs text-zinc-400 mt-1.5">{claimed} of {total} employees redeemed</p>
      </div>
      <div className="flex-shrink-0 text-right">
        <p className="text-5xl font-bold tabular-nums" style={{ color: 'var(--brand,#6366f1)' }}>{pct}%</p>
        <p className="text-xs text-zinc-400 mt-0.5">redeemed</p>
      </div>
    </div>
  )
}
