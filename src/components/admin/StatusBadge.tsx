'use client'

import { useT } from '@/lib/i18n/useT'

type Props = { sentAt: string | null; closedAt: string | null; scheduledConfirmedAt?: string | null }

export function StatusBadge({ sentAt, closedAt, scheduledConfirmedAt }: Props) {
  const t = useT()
  if (closedAt) return <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-500">{t('Closed')}</span>
  if (sentAt) return <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700">{t('Running')}</span>
  if (scheduledConfirmedAt) return <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-100 text-amber-700">{t('Scheduled')}</span>
  return <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-100 text-violet-700">{t('Draft')}</span>
}
