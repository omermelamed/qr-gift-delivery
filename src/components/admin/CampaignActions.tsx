'use client'

import Link from 'next/link'
import { useT } from '@/lib/i18n/useT'

export function ViewQrLink({ campaignId, className }: { campaignId: string; className?: string }) {
  const t = useT()
  return (
    <Link
      href={`/admin/campaigns/${campaignId}/qr`}
      className={className ?? 'border border-zinc-200 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover-brand transition-colors'}
    >
      {t('View QR Codes')}
    </Link>
  )
}

export function ExportCsvLink({ campaignId, className }: { campaignId: string; className?: string }) {
  const t = useT()
  return (
    <a
      href={`/api/campaigns/${campaignId}/export`}
      download
      className={className ?? 'border border-zinc-200 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover-brand transition-colors'}
    >
      {t('Export CSV')}
    </a>
  )
}
