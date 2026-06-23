'use client'

import { useT } from '@/lib/i18n/useT'
import { summarizeArrival } from '@/lib/arrival'

type Row = { attending: boolean | null; attendee_count: number | null }

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-2xl font-bold text-zinc-900">{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  )
}

export function ArrivalSummary({ tokens }: { tokens: Row[] }) {
  const t = useT()
  const { approved, totalArriving, notComing, noResponse } = summarizeArrival(tokens)

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-zinc-900 mb-4">{t('Arrival Certificates')}</h3>
      <div className="grid grid-cols-2 gap-4">
        <Stat label={t('Approved people')} value={approved} />
        <Stat label={t('Total arriving people')} value={totalArriving} />
        <Stat label={t('Not coming')} value={notComing} />
        <Stat label={t('No response')} value={noResponse} />
      </div>
    </div>
  )
}
