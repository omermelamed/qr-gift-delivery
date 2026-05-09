import { describe, it, expect } from 'vitest'
import { he } from '@/lib/i18n/translations.he'

function translate(locale: 'en' | 'he', key: string): string {
  if (locale === 'he') return he[key] ?? key
  return key
}

describe('translate()', () => {
  it('returns key unchanged in English', () => {
    expect(translate('en', 'Check Your Gift')).toBe('Check Your Gift')
  })

  it('returns Hebrew string for a known key', () => {
    expect(translate('he', 'Check Your Gift')).toBe('בדוק את המתנה שלך')
  })

  it('falls back to key when Hebrew translation is missing', () => {
    expect(translate('he', 'untranslated string')).toBe('untranslated string')
  })
})
