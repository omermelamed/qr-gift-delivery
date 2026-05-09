'use client'

import Link from 'next/link'
import { useT } from '@/lib/i18n/useT'

type Props = {
  campaignName: string
  campaignDate: string | null
  scheduledAt: string | null
  sentAt: string | null
}

export function CampaignDetailHeader({ campaignName, campaignDate, scheduledAt, sentAt }: Props) {
  const t = useT()
  return (
    <>
      <div className="mb-6">
        <Link href="/admin" className="text-sm text-zinc-400 hover:text-zinc-700 transition-colors">
          {t('← Campaigns')}
        </Link>
      </div>
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-zinc-900">{campaignName}</h1>
        <p className="text-sm text-zinc-400 mt-0.5">{campaignDate ?? '—'}</p>
        {scheduledAt && !sentAt && (
          <p className="text-xs text-amber-500 mt-1 font-medium">
            {t('Scheduled:')} {new Date(scheduledAt).toLocaleString()}
          </p>
        )}
      </div>
    </>
  )
}
