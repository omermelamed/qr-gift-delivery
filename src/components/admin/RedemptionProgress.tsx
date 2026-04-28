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
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="text-center">
          <p className="text-2xl font-bold text-zinc-900">{total}</p>
          <p className="text-xs text-zinc-400 mt-0.5">Total</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-indigo-600">{claimed}</p>
          <p className="text-xs text-zinc-400 mt-0.5">Claimed</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-amber-500">{pending}</p>
          <p className="text-xs text-zinc-400 mt-0.5">Pending</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-zinc-700">Redemption</span>
        <span className="text-sm font-semibold text-indigo-600">{pct}%</span>
      </div>
      <div className="w-full bg-zinc-100 rounded-full h-2.5">
        <div
          className="bg-gradient-to-r from-indigo-500 to-violet-500 h-2.5 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
