'use client'

import { useLocale } from './LanguageContext'
import { he } from './translations.he'

export function useT() {
  const { locale } = useLocale()
  return function t(key: string): string {
    if (locale === 'he') return he[key] ?? key
    return key
  }
}
