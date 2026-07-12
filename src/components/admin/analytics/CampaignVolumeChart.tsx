'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useT } from '@/lib/i18n/useT'
import type { VolumePoint } from '@/lib/analytics/aggregate'

export function CampaignVolumeChart({ data }: { data: VolumePoint[] }) {
  const t = useT()
  if (data.length === 0) {
    return <p className="rounded-lg bg-zinc-50 px-3 py-6 text-center text-xs text-zinc-400">{t('No campaigns match these filters')}</p>
  }
  return (
    <ResponsiveContainer width="100%" height={180}>
      <BarChart data={data} margin={{ left: 0, right: 8, top: 8, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke="#EDE9E2" />
        <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#888D89' }} />
        <YAxis allowDecimals={false} width={28} tick={{ fontSize: 11, fill: '#888D89' }} />
        <Tooltip formatter={(value) => [value, t('Campaigns')]} />
        <Bar dataKey="count" fill="#6E8B74" radius={[6, 6, 2, 2]} />
      </BarChart>
    </ResponsiveContainer>
  )
}
