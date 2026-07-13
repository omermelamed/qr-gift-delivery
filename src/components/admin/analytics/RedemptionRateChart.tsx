'use client'

import { useMemo, useState } from 'react'
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useT } from '@/lib/i18n/useT'
import { CategoryTick } from './CategoryTick'
import { ToggleLegend } from './ToggleLegend'
import { colorForIndex } from '@/lib/analytics/palette'
import type { RedemptionRatePoint } from '@/lib/analytics/aggregate'

export function RedemptionRateChart({ data }: { data: RedemptionRatePoint[] }) {
  const t = useT()
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  const colorMap = useMemo(
    () => new Map(data.map((d, i) => [d.campaignId, colorForIndex(i)])),
    [data]
  )

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (data.length === 0) {
    return <p className="rounded-lg bg-zinc-50 px-3 py-6 text-center text-xs text-zinc-400">{t('No campaigns match these filters')}</p>
  }

  const visible = data.filter((d) => !hidden.has(d.campaignId))

  return (
    <div>
      <ResponsiveContainer width="100%" height={Math.max(160, visible.length * 34)}>
        <BarChart data={visible} layout="vertical" margin={{ left: 8, right: 20, top: 4, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke="#EDE9E2" />
          <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#888D89' }} />
          <YAxis type="category" dataKey="name" width={160} interval={0} tick={<CategoryTick maxChars={20} />} />
          <Tooltip formatter={(value) => [`${value}%`, t('Redeemed')]} />
          <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
            {visible.map((d) => (
              <Cell key={d.campaignId} fill={colorMap.get(d.campaignId)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <ToggleLegend
        items={data.map((d) => ({ key: d.campaignId, label: d.name, color: colorMap.get(d.campaignId)! }))}
        hidden={hidden}
        onToggle={toggle}
      />
    </div>
  )
}
