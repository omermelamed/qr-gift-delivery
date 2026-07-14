'use client'

import { useMemo, useState } from 'react'
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useT } from '@/lib/i18n/useT'
import { ToggleLegend } from './ToggleLegend'
import { colorForIndex } from '@/lib/analytics/palette'
import type { VolumePoint } from '@/lib/analytics/aggregate'

export function CampaignVolumeChart({ data }: { data: VolumePoint[] }) {
  const t = useT()
  const [hidden, setHidden] = useState<Set<string>>(new Set())

  const colorMap = useMemo(
    () => new Map(data.map((d, i) => [d.month, colorForIndex(i)])),
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

  const visible = data.filter((d) => !hidden.has(d.month))

  return (
    <div>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={visible} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke="#EDE9E2" />
          <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#888D89' }} />
          <YAxis allowDecimals={false} width={28} tick={{ fontSize: 11, fill: '#888D89' }} />
          <Tooltip formatter={(value) => [value, t('Campaigns')]} />
          <Bar dataKey="count" radius={[6, 6, 2, 2]}>
            {visible.map((d) => (
              <Cell key={d.month} fill={colorMap.get(d.month)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <ToggleLegend
        items={data.map((d) => ({ key: d.month, label: d.month, color: colorMap.get(d.month)! }))}
        hidden={hidden}
        onToggle={toggle}
      />
    </div>
  )
}
