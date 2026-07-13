'use client'

import { useT } from '@/lib/i18n/useT'

// The analytics page's error/empty states are returned early from a Server
// Component (page.tsx can't call useT — it's a client-only hook), so they
// need their own small client component to actually get translated, the
// same way the populated case's heading now lives inside AnalyticsUI.
export function AnalyticsStatusMessage({ variant }: { variant: 'error' | 'empty' }) {
  const t = useT()

  if (variant === 'error') {
    return (
      <div className="p-6">
        <p className="text-sm font-medium text-red-600">{t("Couldn't load analytics data. Please refresh the page.")}</p>
      </div>
    )
  }

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-zinc-900">{t('Analytics')}</h1>
      <p className="mt-2 text-sm text-zinc-500">{t('Run your first campaign to start seeing analytics here.')}</p>
    </div>
  )
}
