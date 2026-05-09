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

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en')

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Locale | null
      if (stored === 'he') setLocaleState('he')
    } catch { /* storage unavailable */ }
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = locale === 'he' ? 'rtl' : 'ltr'
    localStorage.setItem(STORAGE_KEY, locale)
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
