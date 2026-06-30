'use client'

import { useT } from '@/lib/i18n/useT'
import { summarizeArrival } from '@/lib/arrival'

type Row = { attending: boolean | null; attendee_count: number | null; arrived_count?: number | null }

function Stat({ label, value, accent }: { label: string; value: number; accent?: boolean }) {
  return (
    <div>
      <p className={`text-2xl font-bold ${accent ? 'text-green-600' : 'text-zinc-900'}`}>{value}</p>
      <p className="text-xs text-zinc-500">{label}</p>
    </div>
  )
}

export function ArrivalSummary({ tokens }: { tokens: Row[] }) {
  const t = useT()
  const { approved, totalArriving, notComing, noResponse, actualArrived } = summarizeArrival(tokens)

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5">
      <h3 className="text-sm font-semibold text-zinc-900 mb-4">{t('Arrival Certificates')}</h3>
      <div className="grid grid-cols-2 gap-4">
        <Stat label={t('Approved people')} value={approved} />
        <Stat label={t('Planned to arrive')} value={totalArriving} />
        <Stat label={t('Actually arrived')} value={actualArrived} accent />
        <Stat label={t('Not coming')} value={notComing} />
        <Stat label={t('No response')} value={noResponse} />
      </div>
    </div>
  )
}
