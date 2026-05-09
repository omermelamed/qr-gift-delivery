'use client'

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react'

type Locale = 'en' | 'he'

const STORAGE_KEY = 'giftflow-locale'

type LanguageContextValue = {
  locale: Locale
  setLocale: (l: Locale) => void
}

const LanguageContext = createContext<LanguageContextValue>({
  locale: 'en',
  setLocale: () => {},
})

export function LanguageProvider({
  children,
  initialLocale,
}: {
  children: ReactNode
  initialLocale?: Locale
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale ?? 'en')

  useEffect(() => {
    // Only read localStorage if no server-side locale was seeded (no cookie present)
    if (initialLocale) return
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Locale | null
      if (stored === 'he') setLocaleState('he')
    } catch { /* storage unavailable */ }
  }, [initialLocale])

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = locale === 'he' ? 'rtl' : 'ltr'
    try {
      localStorage.setItem(STORAGE_KEY, locale)
    } catch { /* storage unavailable */ }
    document.cookie = `${STORAGE_KEY}=${locale};path=/;max-age=31536000;SameSite=Lax`
  }, [locale])

  const setLocale = useCallback((l: Locale) => setLocaleState(l), [])

  return (
    <LanguageContext.Provider value={{ locale, setLocale }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLocale() {
  return useContext(LanguageContext)
}
