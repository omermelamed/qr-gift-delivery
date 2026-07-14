'use client'

import { useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useT } from '@/lib/i18n/useT'
import { CategoryTick } from './CategoryTick'
import { ToggleLegend } from './ToggleLegend'
import type { RsvpPoint } from '@/lib/analytics/aggregate'

export function RsvpVsRedemptionChart({ data }: { data: RsvpPoint[] }) {
  const t = useT()
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (data.length === 0) {
    return <p className="rounded-lg bg-zinc-50 px-3 py-6 text-center text-xs text-zinc-400">{t('No campaigns use arrival certificates in this range')}</p>
  }

  const attendingLabel = t('Confirmed attending')
  const redeemedLabel = t('Actually redeemed')

  return (
    <div>
      <ResponsiveContainer width="100%" height={Math.max(160, data.length * 48)}>
        <BarChart data={data} layout="vertical" margin={{ left: 8, right: 20, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke="#EDE9E2" />
          <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#888D89' }} />
          <YAxis type="category" dataKey="name" width={160} interval={0} tick={<CategoryTick maxChars={20} />} />
          <Tooltip />
          {!hidden.has('attending') && (
            <Bar dataKey="attending" name={attendingLabel} fill="#C76D4A" radius={[0, 4, 4, 0]} />
          )}
          {!hidden.has('redeemed') && (
            <Bar dataKey="redeemed" name={redeemedLabel} fill="#6E8B74" radius={[0, 4, 4, 0]} />
          )}
        </BarChart>
      </ResponsiveContainer>
      <ToggleLegend
        items={[
          { key: 'attending', label: attendingLabel, color: '#C76D4A' },
          { key: 'redeemed', label: redeemedLabel, color: '#6E8B74' },
        ]}
        hidden={hidden}
        onToggle={toggle}
      />
    </div>
  )
}
