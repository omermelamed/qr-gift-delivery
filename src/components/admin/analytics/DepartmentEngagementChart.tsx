'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useT } from '@/lib/i18n/useT'
import { CategoryTick } from './CategoryTick'
import type { DepartmentPoint } from '@/lib/analytics/aggregate'

export function DepartmentEngagementChart({ data }: { data: DepartmentPoint[] }) {
  const t = useT()
  if (data.length === 0) {
    return <p className="rounded-lg bg-zinc-50 px-3 py-6 text-center text-xs text-zinc-400">{t('No campaigns match these filters')}</p>
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 20, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="#EDE9E2" />
        <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11, fill: '#888D89' }} />
        <YAxis type="category" dataKey="department" width={110} interval={0} tick={<CategoryTick maxChars={13} />} />
        <Tooltip formatter={(value) => [`${value}%`, t('Redeemed')]} />
        <Bar dataKey="rate" fill="#E8B86D" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
