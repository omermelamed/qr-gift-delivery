'use client'

import Link from 'next/link'
import { useT } from '@/lib/i18n/useT'
import { StatusBadge } from '@/components/admin/StatusBadge'

type Props = {
  campaignName: string
  campaignDate: string | null
  sentAt: string | null
  closedAt: string | null
}

export function CampaignDetailHeader({ campaignName, campaignDate, sentAt, closedAt }: Props) {
  const t = useT()
  return (
    <>
      <div className="mb-6">
        <Link href="/admin" className="text-sm text-zinc-400 hover-brand-text transition-colors">
          {t('← Campaigns')}
        </Link>
      </div>
      <div className="mb-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-zinc-900">{campaignName}</h1>
          <StatusBadge sentAt={sentAt} closedAt={closedAt} />
        </div>
        {campaignDate && <p className="text-sm text-zinc-400 mt-0.5">{campaignDate}</p>}
      </div>
    </>
  )
}
