'use client'

import { useLocale } from '@/lib/i18n/LanguageContext'

export function LanguageToggle() {
  const { locale, setLocale } = useLocale()
  return (
    <button
      onClick={() => setLocale(locale === 'en' ? 'he' : 'en')}
      className="fixed bottom-20 md:bottom-4 end-4 z-50 bg-white border border-zinc-200 rounded-full px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-md hover-brand transition-colors"
      aria-label={locale === 'en' ? 'Switch to Hebrew' : 'Switch to English'}
    >
      {locale === 'en' ? 'עברית' : 'EN'}
    </button>
  )
}
