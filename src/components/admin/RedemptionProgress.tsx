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
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'gift_tokens',
          filter: `campaign_id=eq.${campaignId}`,
        },
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

  return (
    <div className="border rounded-xl p-5 bg-white">
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold">Redemptions</span>
        <span className="text-sm text-gray-600">{claimed} / {total}</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-3">
        <div
          className="bg-green-500 h-3 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <p className="text-xs text-gray-400 mt-1">{pct}% claimed</p>
    </div>
  )
}
