'use client'

import Link from 'next/link'
import { useT } from '@/lib/i18n/useT'
import { PrintButton } from './PrintButton'

export function QrPageHeader({
  campaignId,
  campaignName,
  count,
}: {
  campaignId: string
  campaignName: string
  count: number
}) {
  const t = useT()
  return (
    <div className="mb-6 flex items-center justify-between">
      <div>
        <Link
          href={`/admin/campaigns/${campaignId}`}
          className="text-sm text-zinc-400 hover-brand-text transition-colors"
        >
          <span className="inline-block rtl:rotate-180">←</span> {campaignName}
        </Link>
        <h1 className="text-2xl font-bold text-zinc-900 mt-2">{t('QR Codes')}</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          {count} {t('codes · share or print this page')}
        </p>
      </div>
      <PrintButton />
    </div>
  )
}
