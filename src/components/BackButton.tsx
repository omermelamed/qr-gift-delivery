'use client'

import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useT } from '@/lib/i18n/useT'
import { useLocale } from '@/lib/i18n/LanguageContext'
import { ArrowLeftIcon } from '@/components/icons'

/**
 * Generic "go back" affordance. Renders only when the current URL carries a
 * `back` query param — i.e. the user arrived via a link that offered a return
 * path, e.g. `/admin/team?back=/admin/campaigns/123`. Drop `<BackButton />` near
 * any page header and link to that page with `?back=<the-return-path>` to enable
 * it. Pass `label` to override the default "Back".
 *
 * Only same-origin relative paths are honored, to avoid open-redirects.
 */
export function BackButton({ label, className = '' }: { label?: string; className?: string }) {
  const t = useT()
  const { locale } = useLocale()
  const params = useSearchParams()
  const back = params.get('back')

  if (!back || !back.startsWith('/') || back.startsWith('//')) return null

  return (
    <Link
      href={back}
      className={`inline-flex items-center gap-1.5 text-sm text-zinc-500 hover-brand-text transition-colors cursor-pointer ${className}`}
    >
      <ArrowLeftIcon className={`w-4 h-4 ${locale === 'he' ? 'rotate-180' : ''}`} />
      {label ?? t('Back')}
    </Link>
  )
}
