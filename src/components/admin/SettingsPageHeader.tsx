'use client'

import { useT } from '@/lib/i18n/useT'

export function SettingsPageHeader() {
  const t = useT()
  return (
    <div className="mb-8">
      <h1 className="text-2xl font-bold text-zinc-900">{t('Settings')}</h1>
      <p className="text-sm text-zinc-500 mt-0.5">{t('Manage your company profile and SMS defaults')}</p>
    </div>
  )
}
