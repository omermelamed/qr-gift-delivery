'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts'
import { useT } from '@/lib/i18n/useT'
import { CategoryTick } from './CategoryTick'
import type { RsvpPoint } from '@/lib/analytics/aggregate'

export function RsvpVsRedemptionChart({ data }: { data: RsvpPoint[] }) {
  const t = useT()
  if (data.length === 0) {
    return <p className="rounded-lg bg-zinc-50 px-3 py-6 text-center text-xs text-zinc-400">{t('No campaigns use arrival certificates in this range')}</p>
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(160, data.length * 48)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 20, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="#EDE9E2" />
        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#888D89' }} />
        <YAxis type="category" dataKey="name" width={160} interval={0} tick={<CategoryTick maxChars={20} />} />
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="attending" name={t('Confirmed attending')} fill="#C76D4A" radius={[0, 4, 4, 0]} />
        <Bar dataKey="redeemed" name={t('Actually redeemed')} fill="#6E8B74" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
