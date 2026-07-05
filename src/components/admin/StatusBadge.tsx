'use client'

import { useT } from '@/lib/i18n/useT'

type Props = { sentAt: string | null; closedAt: string | null }

export function StatusBadge({ sentAt, closedAt }: Props) {
  const t = useT()
  if (closedAt) return <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--color-status-closed-bg)] text-[var(--color-status-closed-text)]">{t('Closed')}</span>
  if (sentAt) return <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--color-status-active-bg)] text-[var(--color-status-active-text)]">{t('Active')}</span>
  return <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[var(--color-status-draft-bg)] text-[var(--color-status-draft-text)]">{t('Draft')}</span>
}
