# Hebrew / RTL Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Hebrew language support with RTL layout across the entire GiftFlow app, controlled by a per-user toggle stored in `localStorage`.

**Architecture:** A `LanguageContext` React context holds the active locale and exposes a `useT()` hook that maps English string keys to Hebrew. Setting `dir="rtl"` on `<html>` activates Tailwind's `rtl:` variant globally. Server pages with UI strings delegate rendering to extracted client components that can call `useT()`.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4, Vitest, no new dependencies.

---

## File Map

**Create:**
- `src/lib/i18n/translations.he.ts` — flat `Record<string, string>` of English → Hebrew
- `src/lib/i18n/LanguageContext.tsx` — context, `LanguageProvider`, `useLocale()` hook
- `src/lib/i18n/useT.ts` — `useT()` hook returning `t(key) => string`
- `src/components/ui/LanguageToggle.tsx` — fixed floating EN/עברית pill button
- `src/components/verify/ResultCard.tsx` — client wrapper for verify result UI
- `src/components/admin/AdminDashboardUI.tsx` — client wrapper for admin campaigns list UI
- `src/components/admin/TeamPageUI.tsx` — client wrapper for team page UI
- `src/components/admin/SettingsPageHeader.tsx` — client wrapper for settings page heading
- `src/components/admin/CampaignDetailHeader.tsx` — client wrapper for campaign detail header
- `tests/lib/i18n.test.ts` — unit tests for translation lookup logic

**Modify:**
- `src/app/layout.tsx` — add `LanguageProvider`, Hebrew font, `LanguageToggle`
- `src/app/globals.css` — add `:lang(he)` font rule
- `src/app/gift/page.tsx` — add `useT()`
- `src/app/(auth)/login/page.tsx` — add `useT()`
- `src/app/unauthorized/page.tsx` — make client, add `useT()`
- `src/app/verify/[token]/page.tsx` — use `ResultCard` instead of inline `Result`
- `src/app/scan/page.tsx` — add `useT()`
- `src/app/admin/page.tsx` — delegate UI to `AdminDashboardUI`
- `src/app/admin/team/page.tsx` — delegate UI to `TeamPageUI`
- `src/app/admin/settings/page.tsx` — add `SettingsPageHeader`
- `src/app/admin/campaigns/[id]/page.tsx` — use `CampaignDetailHeader`
- `src/app/admin/campaigns/new/page.tsx` — add `useT()`
- `src/app/admin/employees/page.tsx` — add `useT()`
- `src/components/admin/Sidebar.tsx` — add `useT()`
- `src/components/platform/PlatformSidebar.tsx` — add `useT()`
- `src/components/admin/SettingsForm.tsx` — add `useT()`

---

## Task 1: Core i18n infrastructure

**Files:**
- Create: `src/lib/i18n/translations.he.ts`
- Create: `src/lib/i18n/LanguageContext.tsx`
- Create: `src/lib/i18n/useT.ts`
- Create: `tests/lib/i18n.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/i18n.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/lib/i18n.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/i18n/translations.he'`

- [ ] **Step 3: Create translations.he.ts**

Create `src/lib/i18n/translations.he.ts`:

```typescript
export const he: Record<string, string> = {
  // Gift lookup page
  'Check Your Gift': 'בדוק את המתנה שלך',
  'Enter your phone number to see if you have an unclaimed gift.': 'הזן את מספר הטלפון שלך כדי לראות אם יש לך מתנה שלא נדרשה.',
  'Phone number': 'מספר טלפון',
  'Looking up…': 'מחפש…',
  'Check': 'בדוק',
  'No unclaimed gifts found for this number.': 'לא נמצאו מתנות שלא נדרשו למספר זה.',
  'You have an unclaimed gift. Find a gift distributor and show them this screen to claim it.': 'יש לך מתנה שלא נדרשה. מצא מפיץ ומצג לו מסך זה כדי לקבל את המתנה.',

  // Verify result / ResultCard
  'Invalid QR code': 'קוד QR לא תקין',
  "This code doesn't exist.": 'קוד זה אינו קיים.',
  'Campaign closed': 'הקמפיין נסגר',
  'No further gifts can be claimed.': 'לא ניתן לדרוש מתנות נוספות.',
  'Already claimed': 'כבר נדרש',
  'already redeemed this gift.': 'כבר מימש את המתנה.',
  'Gift collected!': 'המתנה נלקחה!',
  'Not authorised': 'לא מורשה',
  'You are not assigned to this campaign.': 'אינך משויך לקמפיין זה.',
  'Back to scanner': 'חזרה לסורק',
  'This gift was just redeemed.': 'מתנה זו מומשה זה עתה.',

  // Scan page
  'Point camera at QR code': 'כוון את המצלמה לקוד QR',
  'Scanning for': 'סורק עבור',
  'Which gift did they take?': 'איזו מתנה הם לקחו?',
  'Cancel scan': 'בטל סריקה',
  'Gift collected': 'המתנה נלקחה',
  'No further gifts can be claimed': 'לא ניתן לדרוש מתנות נוספות',
  'You are not assigned to this campaign': 'אינך משויך לקמפיין זה',
  'Could not verify': 'לא ניתן לאמת',
  'Try again': 'נסה שוב',
  'Tap anywhere to scan next': 'הקש בכל מקום לסריקה הבאה',
  '← Admin': '← ניהול',
  'History': 'היסטוריה',
  'Recent scans': 'סריקות אחרונות',
  'No scans yet this session': 'אין סריקות בסשן זה',
  'Claimed': 'נדרש',
  'Not auth.': 'לא מורשה',
  'Invalid': 'לא תקין',
  'Closed': 'סגור',

  // Login page
  'Sign in to your account': 'התחבר לחשבונך',
  'Password updated — sign in with your new password.': 'הסיסמה עודכנה — התחבר עם הסיסמה החדשה שלך.',
  'Email': 'אימייל',
  'Password': 'סיסמה',
  'Signing in…': 'מתחבר…',
  'Sign in': 'כניסה',
  'Forgot password?': 'שכחת סיסמה?',
  'Reset your password': 'אפס את הסיסמה',
  "Enter your email and we'll send a reset link.": 'הזן את האימייל שלך ונשלח קישור לאיפוס.',
  'Sending…': 'שולח…',
  'Send reset link': 'שלח קישור לאיפוס',
  '← Back to sign in': '← חזרה לכניסה',
  'Check your email': 'בדוק את האימייל שלך',
  'Click the link in the email to set a new password.': 'לחץ על הקישור באימייל כדי לקבוע סיסמה חדשה.',
  'We sent a reset link to': 'שלחנו קישור לאיפוס אל',

  // Unauthorized page
  '401 — Unauthorized': '401 — לא מורשה',
  'Access denied': 'גישה נדחתה',
  "You don't have permission to view this page. Contact your administrator if you think this is a mistake.": 'אין לך הרשאה לצפות בדף זה. צור קשר עם המנהל שלך אם אתה חושב שזו טעות.',
  'Go to dashboard': 'עבור ללוח הבקרה',

  // Admin sidebar
  'Campaigns': 'קמפיינים',
  'Employees': 'עובדים',
  'Team': 'צוות',
  'Scan QR': 'סרוק QR',
  'Settings': 'הגדרות',
  'Audit Log': 'יומן ביקורת',
  'Sign out': 'התנתק',

  // Platform sidebar
  'Platform': 'פלטפורמה',
  'Companies': 'חברות',
  'Activity': 'פעילות',

  // Admin campaigns list
  '+ New Campaign': '+ קמפיין חדש',
  'Gifts Sent': 'מתנות שנשלחו',
  'Redeemed': 'מומשו',
  'Unredeemed': 'לא מומשו',
  'No campaigns yet': 'אין קמפיינים עדיין',
  'Create your first campaign to get started': 'צור את הקמפיין הראשון שלך כדי להתחיל',
  'of': 'מתוך',
  'claimed': 'נדרשו',

  // Admin team page
  'Member': 'חבר',
  'Role': 'תפקיד',
  'Status': 'סטטוס',
  'Admin': 'מנהל',
  'Campaign Manager': 'מנהל קמפיין',
  'Scanner': 'סורק',
  'Platform Admin': 'מנהל פלטפורמה',
  'Deactivated': 'מושבת',
  'Pending': 'ממתין',
  'Active': 'פעיל',
  'No team members yet. Invite someone to get started.': 'אין חברי צוות עדיין. הזמן מישהו כדי להתחיל.',

  // Admin settings
  'Manage your company profile and SMS defaults': 'נהל את פרופיל החברה וברירות המחדל של SMS',
  'Company identity': 'זהות החברה',
  'Company name': 'שם החברה',
  'Settings saved': 'ההגדרות נשמרו',
  'Save failed': 'שגיאה בשמירה',
  'Saving…': 'שומר…',
  'Save': 'שמור',
  'Template must contain {link}': 'תבנית חייבת להכיל {link}',

  // Admin campaigns/new
  '← Campaigns': '← קמפיינים',
  'New Campaign': 'קמפיין חדש',
  'Campaign name': 'שם קמפיין',
  'Campaign date': 'תאריך קמפיין',
  'Auto-send at': 'שלח אוטומטית ב',
  '(optional)': '(אופציונלי)',
  'Leave blank to launch manually. Campaigns are checked hourly.': 'השאר ריק להפעלה ידנית. קמפיינים נבדקים מדי שעה.',
  'Creating…': 'יוצר…',
  'Create Campaign': 'צור קמפיין',

  // Admin employees
  'Employee Directory': 'ספריית עובדים',
  'Import CSV': 'ייבא CSV',
  '+ Add employee': '+ הוסף עובד',
  'Search by name or department…': 'חפש לפי שם או מחלקה…',
  'All departments': 'כל המחלקות',
  'No employees yet. Add one or import from CSV.': 'אין עובדים עדיין. הוסף אחד או ייבא מ-CSV.',
  'No employees match your search.': 'אין עובדים התואמים את החיפוש.',
  'Name': 'שם',
  'Phone': 'טלפון',
  'Department': 'מחלקה',
  'Cancel': 'בטל',
  '+ Add phone': '+ הוסף טלפון',
  'Employee removed': 'העובד הוסר',
  'Employee updated': 'העובד עודכן',
  'Employee added': 'העובד נוסף',

  // Admin campaign detail
  'Scheduled:': 'מתוזמן:',
  'View QR Codes': 'צפה בקודי QR',
  'Export CSV': 'ייצא CSV',

  // Generic
  'Network error — please try again': 'שגיאת רשת — אנא נסה שוב',
  'Something went wrong': 'משהו השתבש',
}
```

- [ ] **Step 4: Create LanguageContext.tsx**

Create `src/lib/i18n/LanguageContext.tsx`:

```typescript
'use client'

import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'

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
    const stored = localStorage.getItem(STORAGE_KEY) as Locale | null
    if (stored === 'he') setLocaleState('he')
  }, [])

  useEffect(() => {
    document.documentElement.lang = locale
    document.documentElement.dir = locale === 'he' ? 'rtl' : 'ltr'
    localStorage.setItem(STORAGE_KEY, locale)
    document.cookie = `${STORAGE_KEY}=${locale};path=/;max-age=31536000`
  }, [locale])

  function setLocale(l: Locale) {
    setLocaleState(l)
  }

  return (
    <LanguageContext.Provider value={{ locale, setLocale }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLocale() {
  return useContext(LanguageContext)
}
```

- [ ] **Step 5: Create useT.ts**

Create `src/lib/i18n/useT.ts`:

```typescript
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
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npx vitest run tests/lib/i18n.test.ts
```

Expected: PASS — 3 tests pass

- [ ] **Step 7: Commit**

```bash
git add src/lib/i18n/ tests/lib/i18n.test.ts
git commit -m "feat: add i18n infrastructure — LanguageContext, useT, Hebrew translations"
```

---

## Task 2: LanguageToggle and root layout

**Files:**
- Create: `src/components/ui/LanguageToggle.tsx`
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css`

- [ ] **Step 1: Create LanguageToggle.tsx**

Create `src/components/ui/LanguageToggle.tsx`:

```typescript
'use client'

import { useLocale } from '@/lib/i18n/LanguageContext'

export function LanguageToggle() {
  const { locale, setLocale } = useLocale()
  return (
    <button
      onClick={() => setLocale(locale === 'en' ? 'he' : 'en')}
      className="fixed bottom-4 end-4 z-50 bg-white border border-zinc-200 rounded-full px-3 py-1.5 text-sm font-medium text-zinc-700 shadow-md hover:bg-zinc-50 transition-colors"
      aria-label="Toggle language"
    >
      {locale === 'en' ? 'עברית' : 'EN'}
    </button>
  )
}
```

- [ ] **Step 2: Update layout.tsx**

Replace the full content of `src/app/layout.tsx` with:

```typescript
import type { Metadata } from 'next'
import { Inter, Heebo } from 'next/font/google'
import './globals.css'
import { LanguageProvider } from '@/lib/i18n/LanguageContext'
import { LanguageToggle } from '@/components/ui/LanguageToggle'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const heebo = Heebo({ subsets: ['hebrew'], variable: '--font-heebo', display: 'swap' })

export const metadata: Metadata = {
  title: 'GiftFlow',
  description: 'Employee gift distribution platform',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${heebo.variable}`}>
      <body>
        <LanguageProvider>
          {children}
          <LanguageToggle />
        </LanguageProvider>
      </body>
    </html>
  )
}
```

- [ ] **Step 3: Add Hebrew font rule to globals.css**

Append to `src/app/globals.css`:

```css
:lang(he) {
  font-family: var(--font-heebo), sans-serif;
}
```

- [ ] **Step 4: Verify dev server starts without errors**

```bash
npm run dev
```

Expected: server starts, no TypeScript errors. Visit `http://localhost:3000` — a small `עברית` button is visible at bottom-right. Clicking it changes the button to `EN`. Refresh — stays Hebrew.

- [ ] **Step 5: Commit**

```bash
git add src/components/ui/LanguageToggle.tsx src/app/layout.tsx src/app/globals.css
git commit -m "feat: add LanguageToggle and wrap root layout with LanguageProvider"
```

---

## Task 3: Gift lookup page

**Files:**
- Modify: `src/app/gift/page.tsx`

- [ ] **Step 1: Add useT() to gift/page.tsx**

This file is already `'use client'`. Add the import and replace all hardcoded UI strings with `t()` calls.

Replace the top of the file (after `'use client'`) through the import block with:

```typescript
'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n/useT'

type Gift = {
  campaignName: string
  campaignDate: string | null
  companyName: string
  employeeName: string
}

export default function GiftPage() {
  const t = useT()
  const [phone, setPhone] = useState('')
  const [gifts, setGifts] = useState<Gift[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
```

Replace the JSX return with:

```tsx
  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-start pt-16 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-zinc-900">{t('Check Your Gift')}</h1>
          <p className="text-sm text-zinc-500 mt-1">{t('Enter your phone number to see if you have an unclaimed gift.')}</p>
        </div>

        <form onSubmit={handleLookup} className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="phone" className="text-sm font-medium text-zinc-700">{t('Phone number')}</label>
            <input
              id="phone"
              type="tel"
              placeholder="+1 (555) 000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all"
          >
            {loading ? t('Looking up…') : t('Check')}
          </button>
        </form>

        {gifts !== null && (
          <div className="mt-6">
            {gifts.length === 0 ? (
              <div className="text-center bg-white rounded-2xl border border-zinc-200 p-8">
                <p className="text-zinc-500 text-sm">{t('No unclaimed gifts found for this number.')}</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {gifts.map((gift, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-zinc-200 p-5">
                    <p className="text-xs text-zinc-400 font-medium uppercase tracking-wide mb-1">{gift.companyName}</p>
                    <p className="font-semibold text-zinc-900">{gift.campaignName}</p>
                    {gift.campaignDate && (
                      <p className="text-sm text-zinc-400 mt-0.5">{gift.campaignDate}</p>
                    )}
                    <div className="mt-4 p-3 bg-indigo-50 rounded-lg">
                      <p className="text-sm text-indigo-700 font-medium">Hi {gift.employeeName}!</p>
                      <p className="text-sm text-indigo-600 mt-0.5">
                        {t('You have an unclaimed gift. Find a gift distributor and show them this screen to claim it.')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
```

Also update the error-setting lines in `handleLookup` to use translated strings:

```typescript
  async function handleLookup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setGifts(null)
    try {
      const res = await fetch('/api/gift/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? t('Something went wrong'))
        return
      }
      setGifts(data.gifts)
    } catch {
      setError(t('Network error — please try again'))
    } finally {
      setLoading(false)
    }
  }
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/gift/page.tsx
git commit -m "feat: translate gift lookup page to Hebrew"
```

---

## Task 4: Login page

**Files:**
- Modify: `src/app/(auth)/login/page.tsx`

- [ ] **Step 1: Add useT() to LoginForm**

The file has two components: `LoginForm` (client) and `LoginPage` (default export). Add `useT()` only inside `LoginForm`.

Add import after the existing imports:

```typescript
import { useT } from '@/lib/i18n/useT'
```

Add `const t = useT()` as the first line inside `LoginForm()`.

Replace all hardcoded UI strings with `t()` calls. The complete translated `LoginForm` return block:

```tsx
  if (mode === 'signin') return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-8 flex flex-col gap-5">
      <h1 className="text-lg font-semibold text-zinc-900">{t('Sign in to your account')}</h1>

      {resetSuccess && (
        <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
          {t('Password updated — sign in with your new password.')}
        </p>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-sm font-medium text-zinc-700">{t('Email')}</label>
          <input id="email" type="email" placeholder="you@company.com" value={email}
            onChange={(e) => setEmail(e.target.value)} required
            className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-sm font-medium text-zinc-700">{t('Password')}</label>
          <input id="password" type="password" placeholder="••••••••" value={password}
            onChange={(e) => setPassword(e.target.value)} required
            className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
        </div>

        <button type="submit" disabled={loading}
          className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all mt-1">
          {loading ? t('Signing in…') : t('Sign in')}
        </button>
      </form>

      <button onClick={() => { setError(null); setForgotEmail(email); setMode('forgot') }}
        className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors text-center">
        {t('Forgot password?')}
      </button>
    </div>
  )

  if (mode === 'forgot') return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-8 flex flex-col gap-5">
      <h1 className="text-lg font-semibold text-zinc-900">{t('Reset your password')}</h1>
      <p className="text-sm text-zinc-500">{t("Enter your email and we'll send a reset link.")}</p>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
      )}

      <form onSubmit={handleForgot} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="forgot-email" className="text-sm font-medium text-zinc-700">{t('Email')}</label>
          <input id="forgot-email" type="email" placeholder="you@company.com" value={forgotEmail}
            onChange={(e) => setForgotEmail(e.target.value)} required
            className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
        </div>

        <button type="submit" disabled={loading}
          className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all">
          {loading ? t('Sending…') : t('Send reset link')}
        </button>
      </form>

      <button onClick={() => { setError(null); setMode('signin') }}
        className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors text-center">
        {t('← Back to sign in')}
      </button>
    </div>
  )

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-8 flex flex-col gap-5">
      <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
        <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h1 className="text-lg font-semibold text-zinc-900">{t('Check your email')}</h1>
      <p className="text-sm text-zinc-500">
        {t('We sent a reset link to')} <span className="font-medium text-zinc-700">{forgotEmail}</span>.{' '}
        {t('Click the link in the email to set a new password.')}
      </p>
      <button onClick={() => setMode('signin')}
        className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors text-center">
        {t('← Back to sign in')}
      </button>
    </div>
  )
```

Note: the original `LoginForm` uses `if (mode === 'signin')` blocks — restructure the single return to match by converting to early returns for each mode, then a fallback return for 'sent'.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/\(auth\)/login/page.tsx
git commit -m "feat: translate login page to Hebrew"
```

---

## Task 5: Unauthorized page

**Files:**
- Modify: `src/app/unauthorized/page.tsx`

- [ ] **Step 1: Make client and add useT()**

Replace the full content of `src/app/unauthorized/page.tsx`:

```typescript
'use client'

import Link from 'next/link'
import { useT } from '@/lib/i18n/useT'

export default function UnauthorizedPage() {
  const t = useT()
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-8">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <p className="text-xs font-bold tracking-widest text-red-400 uppercase mb-2">{t('401 — Unauthorized')}</p>
        <h1 className="text-2xl font-bold text-zinc-900 mb-3">{t('Access denied')}</h1>
        <p className="text-sm text-zinc-500 mb-8">
          {t("You don't have permission to view this page. Contact your administrator if you think this is a mistake.")}
        </p>
        <Link
          href="/admin"
          className="inline-block text-white text-sm font-semibold rounded-lg px-5 py-2.5 hover:brightness-110 transition-all"
          style={{ backgroundColor: 'var(--brand, #6366f1)' }}
        >
          {t('Go to dashboard')}
        </Link>
      </div>
    </main>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/unauthorized/page.tsx
git commit -m "feat: translate unauthorized page to Hebrew"
```

---

## Task 6: Verify page — extract ResultCard

**Files:**
- Create: `src/components/verify/ResultCard.tsx`
- Modify: `src/app/verify/[token]/page.tsx`

- [ ] **Step 1: Create ResultCard.tsx**

Create `src/components/verify/ResultCard.tsx`:

```typescript
'use client'

import { useT } from '@/lib/i18n/useT'

type Props = {
  icon: string
  color: 'green' | 'red'
  title: string
  subtitle: string
  subtitlePrefix?: string
}

export function ResultCard({ icon, color, title, subtitle, subtitlePrefix }: Props) {
  const t = useT()
  const bg = color === 'green' ? 'bg-green-600' : 'bg-red-600'
  return (
    <main className={`flex flex-col items-center justify-center min-h-screen ${bg} gap-5 px-8`}>
      <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg">
        <span className="text-4xl">{icon}</span>
      </div>
      <p className="text-white text-4xl font-bold text-center">{t(title)}</p>
      <p className="text-white/80 text-lg text-center">
        {subtitlePrefix ? `${subtitlePrefix} ${t(subtitle)}` : t(subtitle)}
      </p>
      <a
        href="/scan"
        className="mt-6 bg-white/20 hover:bg-white/30 text-white font-medium px-5 py-2.5 rounded-lg transition-colors"
      >
        {t('Back to scanner')}
      </a>
    </main>
  )
}
```

- [ ] **Step 2: Update verify/[token]/page.tsx**

Remove the inline `Result` function at the bottom of the file and import `ResultCard` instead.

Add this import at the top of `src/app/verify/[token]/page.tsx`:

```typescript
import { ResultCard } from '@/components/verify/ResultCard'
```

Replace every occurrence of `<Result` with `<ResultCard` and every `/>` closing those tags stays the same.

Replace this call:
```tsx
return <Result icon="✗" color="red" title="Invalid QR code" subtitle="This code doesn't exist." />
```
with:
```tsx
return <ResultCard icon="✗" color="red" title="Invalid QR code" subtitle="This code doesn't exist." />
```

Replace:
```tsx
return <Result icon="✗" color="red" title="Campaign closed" subtitle="No further gifts can be claimed." />
```
with:
```tsx
return <ResultCard icon="✗" color="red" title="Campaign closed" subtitle="No further gifts can be claimed." />
```

Replace:
```tsx
return (
  <Result
    icon="✗"
    color="red"
    title="Already claimed"
    subtitle={`${tokenRow.employee_name} already redeemed this gift.`}
  />
)
```
with:
```tsx
return (
  <ResultCard
    icon="✗"
    color="red"
    title="Already claimed"
    subtitlePrefix={tokenRow.employee_name}
    subtitle="already redeemed this gift."
  />
)
```

Replace:
```tsx
return (
  <Result
    icon="✗"
    color="red"
    title="Not authorised"
    subtitle="You are not assigned to this campaign."
  />
)
```
with:
```tsx
return (
  <ResultCard
    icon="✗"
    color="red"
    title="Not authorised"
    subtitle="You are not assigned to this campaign."
  />
)
```

Replace:
```tsx
return (
  <Result
    icon="✓"
    color="green"
    title={redeemed.employee_name}
    subtitle="Gift collected!"
  />
)
```
with:
```tsx
return (
  <ResultCard
    icon="✓"
    color="green"
    title={redeemed.employee_name}
    subtitle="Gift collected!"
  />
)
```

Replace the final:
```tsx
return <Result icon="✗" color="red" title="Already claimed" subtitle="This gift was just redeemed." />
```
with:
```tsx
return <ResultCard icon="✗" color="red" title="Already claimed" subtitle="This gift was just redeemed." />
```

Delete the entire `function Result(...)` declaration from the bottom of the file.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/verify/ResultCard.tsx src/app/verify/
git commit -m "feat: extract ResultCard client component for translated verify results"
```

---

## Task 7: Scan page

**Files:**
- Modify: `src/app/scan/page.tsx`

- [ ] **Step 1: Add useT() to scan/page.tsx**

Add import after the existing imports:

```typescript
import { useT } from '@/lib/i18n/useT'
```

Add `const t = useT()` as the first line inside `ScanPage()`.

Replace hardcoded strings in the JSX return. The complete set of changes:

```tsx
{/* Replace "Point camera at QR code" */}
<p className="text-white/50 text-sm mt-6">{t('Point camera at QR code')}</p>

{/* Replace "Scanning for" */}
<p className="text-white/60 text-sm text-center mb-1">{t('Scanning for')}</p>

{/* Replace "Which gift did they take?" */}
<p className="text-white/80 text-sm font-medium text-center mb-4">{t('Which gift did they take?')}</p>

{/* Replace "Cancel scan" */}
<button onClick={handleCancelGift} disabled={giftLoading}
  className="mt-6 text-white/40 text-sm text-center w-full">
  {t('Cancel scan')}
</button>

{/* Replace result success text */}
{result.valid ? (
  <>
    <p className="text-white text-4xl font-bold text-center px-8">{result.employeeName}</p>
    <p className="text-white/80 text-lg">{t('Gift collected')}</p>
  </>
) : result.reason === 'campaign_closed' ? (
  <>
    <p className="text-white text-3xl font-bold">{t('Campaign closed')}</p>
    <p className="text-white/80 text-lg">{t('No further gifts can be claimed')}</p>
  </>
) : result.reason === 'not_authorized' ? (
  <>
    <p className="text-white text-3xl font-bold">{t('Not authorised')}</p>
    <p className="text-white/80 text-lg">{t('You are not assigned to this campaign')}</p>
  </>
) : result.reason === 'already_used' ? (
  <>
    <p className="text-white text-3xl font-bold">{t('Already claimed')}</p>
    {result.employeeName && (
      <p className="text-white/80 text-lg">{result.employeeName}</p>
    )}
  </>
) : (
  <>
    <p className="text-white text-3xl font-bold">{t('Could not verify')}</p>
    <p className="text-white/80 text-lg">{t('Try again')}</p>
  </>
)}

<p className="text-white/40 text-sm absolute bottom-10">{t('Tap anywhere to scan next')}</p>

{/* Replace "← Admin" */}
<a href="/admin"
  className="absolute top-5 start-5 bg-zinc-800/80 text-white text-sm font-medium px-4 py-2 rounded-full backdrop-blur-sm">
  {t('← Admin')}
</a>

{/* Replace "History (...)" button */}
<button onClick={() => setShowHistory(true)}
  className="absolute bottom-8 end-6 bg-zinc-800/80 text-white text-sm font-medium px-4 py-2 rounded-full backdrop-blur-sm">
  {t('History')} {scanHistory.length > 0 && `(${scanHistory.length})`}
</button>

{/* Replace "Recent scans" heading */}
<h2 className="text-white font-semibold">{t('Recent scans')}</h2>

{/* Replace "No scans yet this session" */}
<p className="text-zinc-400 text-sm text-center py-6">{t('No scans yet this session')}</p>

{/* Replace history entry text */}
<p className="text-sm font-medium text-white truncate">
  {entry.employeeName ??
    (entry.outcome === 'invalid' ? t('Invalid QR code') :
     entry.outcome === 'not_authorized' ? t('Not auth.') :
     entry.outcome === 'closed' ? t('Campaign closed') : t('Could not verify'))}
</p>

{/* Replace history outcome badge */}
<span className={`text-xs font-medium flex-shrink-0 ${
  entry.outcome === 'success' ? 'text-green-400' :
  entry.outcome === 'already_claimed' ? 'text-amber-400' : 'text-red-400'
}`}>
  {entry.outcome === 'success' ? t('Claimed') :
   entry.outcome === 'already_claimed' ? t('Already claimed') :
   entry.outcome === 'closed' ? t('Closed') :
   entry.outcome === 'not_authorized' ? t('Not auth.') : t('Invalid')}
</span>
```

Note: also change `left-5` → `start-5` and `right-6` → `end-6` on the ← Admin and History buttons for RTL positioning (already shown in the code above).

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/scan/page.tsx
git commit -m "feat: translate scan page to Hebrew"
```

---

## Task 8: Admin Sidebar

**Files:**
- Modify: `src/components/admin/Sidebar.tsx`

- [ ] **Step 1: Add useT() to Sidebar**

Add import after the existing imports:

```typescript
import { useT } from '@/lib/i18n/useT'
```

Add `const t = useT()` as the first line inside `Sidebar()`.

Replace the `navItem` calls and sign out button label:

```tsx
{navItem('/admin', t('Campaigns'), isCampaigns, /* svg */ )}
{navItem('/admin/employees', t('Employees'), isEmployees, /* svg */ )}
{navItem('/admin/team', t('Team'), isTeam, /* svg */ )}
{navItem('/scan', t('Scan QR'), isScan, /* svg */ )}
{navItem('/admin/settings', t('Settings'), isSettings, /* svg */ )}
{navItem('/admin/audit', t('Audit Log'), isAudit, /* svg */ )}
```

Replace the "GiftFlow" span:
```tsx
<span className="text-white font-bold text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75">
  GiftFlow
</span>
```
Keep as-is (brand name, not translated).

Replace the sign out button label span:
```tsx
<span className="text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75">
  {t('Sign out')}
</span>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/Sidebar.tsx
git commit -m "feat: translate admin sidebar to Hebrew"
```

---

## Task 9: Platform Sidebar

**Files:**
- Modify: `src/components/platform/PlatformSidebar.tsx`

- [ ] **Step 1: Add useT() to PlatformSidebar**

Add import after the existing imports:

```typescript
import { useT } from '@/lib/i18n/useT'
```

Add `const t = useT()` as the first line inside `PlatformSidebar()`.

Replace the platform label span:
```tsx
<span className="text-xs text-zinc-500 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75 uppercase tracking-wider font-medium">
  {t('Platform')}
</span>
```

Replace the navItem calls:
```tsx
{navItem('/platform', t('Companies'), isCompanies, /* svg */ )}
{navItem('/platform/activity', t('Activity'), isActivity, /* svg */ )}
```

Replace the sign out button label:
```tsx
<span className="text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75">
  {t('Sign out')}
</span>
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/platform/PlatformSidebar.tsx
git commit -m "feat: translate platform sidebar to Hebrew"
```

---

## Task 10: Admin campaigns list — extract AdminDashboardUI

**Files:**
- Create: `src/components/admin/AdminDashboardUI.tsx`
- Modify: `src/app/admin/page.tsx`

- [ ] **Step 1: Create AdminDashboardUI.tsx**

Create `src/components/admin/AdminDashboardUI.tsx`:

```typescript
'use client'

import Link from 'next/link'
import { DuplicateCampaignButton } from '@/components/admin/DuplicateCampaignButton'
import { DeleteCampaignButton } from '@/components/admin/DeleteCampaignButton'
import { StatusBadge } from '@/components/admin/StatusBadge'
import { useT } from '@/lib/i18n/useT'

type CampaignRow = {
  id: string
  name: string
  campaign_date: string | null
  sent_at: string | null
  closed_at: string | null
  stats: { total: number; redeemed: number }
}

type Props = {
  campaigns: CampaignRow[]
  totalGifts: number
  totalRedeemed: number
}

export function AdminDashboardUI({ campaigns, totalGifts, totalRedeemed }: Props) {
  const t = useT()
  const totalCampaigns = campaigns.length
  const totalUnredeemed = totalGifts - totalRedeemed
  const overallPct = totalGifts > 0 ? Math.round((totalRedeemed / totalGifts) * 100) : 0

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">{t('Campaigns')}</h1>
        <Link
          href="/admin/campaigns/new"
          className="text-white rounded-lg px-4 py-2 text-sm font-semibold hover:brightness-110 transition-all"
          style={{ backgroundColor: 'var(--brand, #6366f1)' }}
        >
          {t('+ New Campaign')}
        </Link>
      </div>

      {campaigns.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            { label: t('Campaigns'), value: totalCampaigns },
            { label: t('Gifts Sent'), value: totalGifts },
            { label: t('Redeemed'), value: `${totalRedeemed} (${overallPct}%)` },
            { label: t('Unredeemed'), value: totalUnredeemed },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white border border-zinc-200 rounded-xl p-4">
              <p className="text-xs text-zinc-400 font-medium uppercase tracking-wide">{label}</p>
              <p className="text-2xl font-bold text-zinc-900 mt-1">{value}</p>
            </div>
          ))}
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl border border-zinc-200">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 mx-auto mb-4" />
          <p className="text-zinc-900 font-semibold mb-1">{t('No campaigns yet')}</p>
          <p className="text-sm text-zinc-500 mb-6">{t('Create your first campaign to get started')}</p>
          <Link
            href="/admin/campaigns/new"
            className="text-white rounded-lg px-4 py-2 text-sm font-semibold hover:brightness-110 transition-all"
            style={{ backgroundColor: 'var(--brand, #6366f1)' }}
          >
            {t('+ New Campaign')}
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {campaigns.map((c) => {
            const pct = c.stats.total > 0 ? Math.round((c.stats.redeemed / c.stats.total) * 100) : 0
            const showProgress = !!c.sent_at && c.stats.total > 0
            return (
              <Link
                key={c.id}
                href={`/admin/campaigns/${c.id}`}
                className="bg-white border border-zinc-200 rounded-xl p-5 hover:shadow-md transition-shadow group"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-semibold text-zinc-900 group-hover:text-indigo-600 transition-colors truncate">
                      {c.name}
                    </p>
                    <p className="text-sm text-zinc-400 mt-0.5">{c.campaign_date ?? '—'}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {!c.sent_at && <DeleteCampaignButton campaignId={c.id} />}
                    <DuplicateCampaignButton
                      campaignId={c.id}
                      sourceName={c.name}
                      sourceDate={c.campaign_date}
                    />
                    <StatusBadge sentAt={c.sent_at} closedAt={c.closed_at} />
                  </div>
                </div>

                {showProgress && (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-zinc-400 mb-1.5">
                      <span>{c.stats.redeemed} {t('of')} {c.stats.total} {t('claimed')}</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${pct}%`, backgroundColor: 'var(--brand, #6366f1)' }}
                      />
                    </div>
                  </div>
                )}
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update admin/page.tsx**

Replace the full content of `src/app/admin/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { AdminDashboardUI } from '@/components/admin/AdminDashboardUI'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const appMeta = user.app_metadata as JwtAppMetadata

  const service = createServiceClient()
  const { data: campaigns } = await service
    .from('campaigns')
    .select('id, name, campaign_date, sent_at, closed_at')
    .eq('company_id', appMeta.company_id)
    .order('created_at', { ascending: false })

  const list = campaigns ?? []

  const { data: tokenRows } = list.length
    ? await service
        .from('gift_tokens')
        .select('campaign_id, redeemed')
        .in('campaign_id', list.map((c) => c.id))
    : { data: [] }

  const statsMap = new Map<string, { total: number; redeemed: number }>()
  for (const t of tokenRows ?? []) {
    if (!statsMap.has(t.campaign_id)) statsMap.set(t.campaign_id, { total: 0, redeemed: 0 })
    const s = statsMap.get(t.campaign_id)!
    s.total++
    if (t.redeemed) s.redeemed++
  }

  let totalGifts = 0, totalRedeemed = 0
  for (const v of statsMap.values()) { totalGifts += v.total; totalRedeemed += v.redeemed }

  const campaignsWithStats = list.map((c) => ({
    ...c,
    stats: statsMap.get(c.id) ?? { total: 0, redeemed: 0 },
  }))

  return (
    <AdminDashboardUI
      campaigns={campaignsWithStats}
      totalGifts={totalGifts}
      totalRedeemed={totalRedeemed}
    />
  )
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/AdminDashboardUI.tsx src/app/admin/page.tsx
git commit -m "feat: extract AdminDashboardUI, translate admin campaigns list"
```

---

## Task 11: Admin team page — extract TeamPageUI

**Files:**
- Create: `src/components/admin/TeamPageUI.tsx`
- Modify: `src/app/admin/team/page.tsx`

- [ ] **Step 1: Create TeamPageUI.tsx**

Create `src/components/admin/TeamPageUI.tsx`:

```typescript
'use client'

import { RemoveMemberButton } from '@/components/admin/RemoveMemberButton'
import { InviteButton } from '@/components/admin/InviteButton'
import { EditMemberButton } from '@/components/admin/EditMemberButton'
import { useT } from '@/lib/i18n/useT'

export type Member = {
  id: string
  email: string
  name: string
  role_name: string
  isPending: boolean
  isDeactivated: boolean
  isSelf: boolean
}

type Props = { members: Member[] }

export function TeamPageUI({ members }: Props) {
  const t = useT()

  const ROLE_LABELS: Record<string, string> = {
    company_admin: t('Admin'),
    campaign_manager: t('Campaign Manager'),
    scanner: t('Scanner'),
    platform_admin: t('Platform Admin'),
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">{t('Team')}</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {members.length} {members.length !== 1 ? 'members' : 'member'}
          </p>
        </div>
        <InviteButton />
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        {members.length === 0 ? (
          <div className="text-center py-16 text-zinc-400 text-sm">
            {t('No team members yet. Invite someone to get started.')}
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-start text-xs text-zinc-400 border-b border-zinc-100">
                <th className="px-5 py-3 font-medium text-start">{t('Member')}</th>
                <th className="px-5 py-3 font-medium text-start">{t('Role')}</th>
                <th className="px-5 py-3 font-medium text-start">{t('Status')}</th>
                <th className="px-5 py-3 font-medium w-10" />
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                  <td className="px-5 py-3">
                    <p className="font-medium text-zinc-900">{m.name}</p>
                    <p className="text-xs text-zinc-400">{m.email}</p>
                  </td>
                  <td className="px-5 py-3 text-zinc-600">{ROLE_LABELS[m.role_name] ?? m.role_name}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      m.isDeactivated ? 'bg-zinc-100 text-zinc-500'
                        : m.isPending ? 'bg-violet-100 text-violet-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {m.isDeactivated ? t('Deactivated') : m.isPending ? t('Pending') : t('Active')}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-end">
                    <div className="flex items-center justify-end gap-2">
                      <EditMemberButton
                        userId={m.id} name={m.name} email={m.email}
                        roleName={m.role_name} isActive={!m.isDeactivated}
                        isPending={m.isPending} isSelf={m.isSelf}
                      />
                      {!m.isSelf && <RemoveMemberButton userId={m.id} name={m.name} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update admin/team/page.tsx**

Replace the full content of `src/app/admin/team/page.tsx`:

```typescript
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { TeamPageUI, type Member } from '@/components/admin/TeamPageUI'

export default async function TeamPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const appMeta = user.app_metadata as JwtAppMetadata
  if (appMeta.role_name !== 'company_admin') redirect('/admin')

  const service = createServiceClient()

  const { data: ucr } = await service
    .from('user_company_roles')
    .select('user_id, role_id, roles(name)')
    .eq('company_id', appMeta.company_id)

  const companyUserIds = new Set((ucr ?? []).map((r) => r.user_id))

  const listResult = await service.auth.admin.listUsers({ perPage: 1000 })
  const allUsers = listResult.data?.users ?? []

  const companyUsers = allUsers.filter((u) => {
    const meta = u.app_metadata as JwtAppMetadata | undefined
    return companyUserIds.has(u.id) || meta?.company_id === appMeta.company_id
  })

  const members: Member[] = companyUsers.map((u) => {
    const ucrRow = (ucr ?? []).find((r) => r.user_id === u.id)
    const roleRow = ucrRow?.roles as unknown as { name: string } | null
    const meta = u.app_metadata as JwtAppMetadata | undefined
    const bannedUntil = (u as unknown as { banned_until?: string }).banned_until
    return {
      id: u.id,
      email: u.email ?? '',
      name: u.user_metadata?.full_name ?? u.email?.split('@')[0] ?? '—',
      role_name: roleRow?.name ?? meta?.role_name ?? '—',
      isPending: !u.last_sign_in_at,
      isDeactivated: !!(bannedUntil && new Date(bannedUntil) > new Date()),
      isSelf: u.id === user.id,
    }
  })

  return <TeamPageUI members={members} />
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/TeamPageUI.tsx src/app/admin/team/page.tsx
git commit -m "feat: extract TeamPageUI, translate admin team page"
```

---

## Task 12: Admin settings page

**Files:**
- Create: `src/components/admin/SettingsPageHeader.tsx`
- Modify: `src/app/admin/settings/page.tsx`
- Modify: `src/components/admin/SettingsForm.tsx`

- [ ] **Step 1: Create SettingsPageHeader.tsx**

Create `src/components/admin/SettingsPageHeader.tsx`:

```typescript
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
```

- [ ] **Step 2: Update settings/page.tsx**

Add import at the top of `src/app/admin/settings/page.tsx`:

```typescript
import { SettingsPageHeader } from '@/components/admin/SettingsPageHeader'
```

Replace the `<div className="mb-8">` block in the return with:

```tsx
<SettingsPageHeader />
```

The full return becomes:

```tsx
  return (
    <div className="p-8 max-w-2xl mx-auto">
      <SettingsPageHeader />
      <SettingsForm
        companyId={company.id}
        initialName={company.name}
        initialLogoUrl={company.logo_url}
        initialTemplate={company.sms_template}
        initialThemeColor={company.theme_color}
      />
    </div>
  )
```

- [ ] **Step 3: Add useT() to SettingsForm.tsx**

Add import after the existing imports in `src/components/admin/SettingsForm.tsx`:

```typescript
import { useT } from '@/lib/i18n/useT'
```

Add `const t = useT()` as the first line inside `SettingsForm()`.

Replace these strings inside `SettingsForm`:

```tsx
{/* Section heading */}
<h2 className="font-semibold text-zinc-900">{t('Company identity')}</h2>

{/* Company name label */}
<label htmlFor="co-name" className="text-sm font-medium text-zinc-700">{t('Company name')}</label>

{/* Template error */}
{templateError && <p className="text-xs text-red-500 mt-1">{t('Template must contain {link}')}</p>}

{/* Success/error message */}
{message && (
  <p className={`text-sm px-3 py-2 rounded-lg border ${
    message.type === 'success'
      ? 'text-green-700 bg-green-50 border-green-100'
      : 'text-red-600 bg-red-50 border-red-100'
  }`}>
    {message.text}
  </p>
)}

{/* Submit button */}
<button type="submit" disabled={saving || !!templateError || !name.trim()}
  className="...">
  {saving ? t('Saving…') : t('Save')}
</button>
```

For the `setMessage` calls, replace static strings:

```typescript
setMessage({ text: t('Settings saved'), type: 'success' })
// ...
setMessage({ text: data.error ?? t('Save failed'), type: 'error' })
// ...
setMessage({ text: t('Network error — please try again'), type: 'error' })
```

Note: `t()` must be called inside the component body, not inside `handleSubmit` (which runs later). Move `t` to be available in the closure by defining it at the top of the component. Since `t` is defined at the component level, it is available in the event handler closure.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/SettingsPageHeader.tsx src/app/admin/settings/page.tsx src/components/admin/SettingsForm.tsx
git commit -m "feat: translate admin settings page"
```

---

## Task 13: Admin campaigns/new page

**Files:**
- Modify: `src/app/admin/campaigns/new/page.tsx`

- [ ] **Step 1: Add useT() to NewCampaignPage**

Add import after existing imports:

```typescript
import { useT } from '@/lib/i18n/useT'
```

Add `const t = useT()` as first line inside `NewCampaignPage()`.

Replace the complete JSX return:

```tsx
  return (
    <div className="p-8 max-w-lg mx-auto">
      <Link href="/admin" className="text-sm text-zinc-400 hover:text-zinc-700 transition-colors mb-6 inline-block">
        {t('← Campaigns')}
      </Link>

      <h1 className="text-2xl font-bold text-zinc-900 mb-8">{t('New Campaign')}</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 flex flex-col gap-5">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-sm font-medium text-zinc-700">{t('Campaign name')}</label>
          <input id="name" type="text" placeholder={t('e.g. Passover 2026')} value={name}
            onChange={(e) => setName(e.target.value)} required
            className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="date" className="text-sm font-medium text-zinc-700">{t('Campaign date')}</label>
          <input id="date" type="date" value={campaignDate}
            onChange={(e) => setCampaignDate(e.target.value)} required
            className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="scheduled" className="text-sm font-medium text-zinc-700">
            {t('Auto-send at')} <span className="text-zinc-400 font-normal">{t('(optional)')}</span>
          </label>
          <input id="scheduled" type="datetime-local" value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
          <p className="text-xs text-zinc-400">{t('Leave blank to launch manually. Campaigns are checked hourly.')}</p>
        </div>

        <button type="submit" disabled={loading}
          className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all mt-1">
          {loading ? t('Creating…') : t('Create Campaign')}
        </button>
      </form>
    </div>
  )
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/campaigns/new/page.tsx
git commit -m "feat: translate new campaign page to Hebrew"
```

---

## Task 14: Admin employees page

**Files:**
- Modify: `src/app/admin/employees/page.tsx`

- [ ] **Step 1: Add useT() to EmployeesPage**

Add import after existing imports:

```typescript
import { useT } from '@/lib/i18n/useT'
```

Add `const t = useT()` as the first line inside `EmployeesPage()`.

Replace `showToast('Employee removed')` → `showToast(t('Employee removed'))`
Replace `showToast('Employee updated')` → `showToast(t('Employee updated'))`
In `onAdded` callback: `showToast(t('Employee added'))`

Replace the JSX strings in the return:

```tsx
{/* Heading */}
<h1 className="text-2xl font-bold text-zinc-900">{t('Employee Directory')}</h1>

{/* Buttons */}
<button onClick={() => setShowImport(true)} ...>{t('Import CSV')}</button>
<button onClick={() => setShowAdd(true)} ...>{t('+ Add employee')}</button>

{/* Search input */}
<input type="text" placeholder={t('Search by name or department…')} .../>

{/* Department filter */}
<option value="">{t('All departments')}</option>

{/* Empty states */}
{employees.length === 0
  ? t('No employees yet. Add one or import from CSV.')
  : t('No employees match your search.')}

{/* Table headers */}
<th className="px-5 py-3 font-medium text-start">{t('Name')}</th>
<th className="px-5 py-3 font-medium text-start">{t('Phone')}</th>
<th className="px-5 py-3 font-medium text-start">{t('Department')}</th>

{/* Inline edit buttons */}
<button onClick={() => handleSaveEdit(e.id)} ...>{t('Save')}</button>
<button onClick={() => setEditingId(null)} ...>{t('Cancel')}</button>

{/* Add phone button */}
<button onClick={() => startEdit(e)} ...>{t('+ Add phone')}</button>
```

Also change `text-left` on `<tr className="text-left ...">` → `text-start`.

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/employees/page.tsx
git commit -m "feat: translate employees page to Hebrew"
```

---

## Task 15: Campaign detail header

**Files:**
- Create: `src/components/admin/CampaignDetailHeader.tsx`
- Modify: `src/app/admin/campaigns/[id]/page.tsx`

- [ ] **Step 1: Create CampaignDetailHeader.tsx**

Create `src/components/admin/CampaignDetailHeader.tsx`:

```typescript
'use client'

import Link from 'next/link'
import { useT } from '@/lib/i18n/useT'

type Props = {
  campaignId: string
  campaignName: string
  campaignDate: string | null
  scheduledAt: string | null
  sentAt: string | null
  closedAt: string | null
}

export function CampaignDetailHeader({
  campaignId,
  campaignName,
  campaignDate,
  scheduledAt,
  sentAt,
  closedAt,
}: Props) {
  const t = useT()
  const isDraft = !sentAt

  return (
    <>
      <div className="mb-6">
        <Link href="/admin" className="text-sm text-zinc-400 hover:text-zinc-700 transition-colors">
          {t('← Campaigns')}
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">{campaignName}</h1>
        <p className="text-sm text-zinc-400 mt-0.5">{campaignDate ?? '—'}</p>
        {scheduledAt && !sentAt && (
          <p className="text-xs text-amber-500 mt-1 font-medium">
            {t('Scheduled:')} {new Date(scheduledAt).toLocaleString()}
          </p>
        )}
      </div>
    </>
  )
}
```

- [ ] **Step 2: Import CampaignDetailHeader in campaign detail page**

Add this import at the top of `src/app/admin/campaigns/[id]/page.tsx`:

```typescript
import { CampaignDetailHeader } from '@/components/admin/CampaignDetailHeader'
```

Replace the current header section in the JSX:

```tsx
{/* OLD: */}
<div className="mb-6">
  <Link href="/admin" className="text-sm text-zinc-400 hover:text-zinc-700 transition-colors">
    ← Campaigns
  </Link>
</div>

<div className="flex items-start justify-between gap-4 mb-6">
  <div>
    <h1 className="text-2xl font-bold text-zinc-900">{campaign.name}</h1>
    <p className="text-sm text-zinc-400 mt-0.5">{campaign.campaign_date ?? '—'}</p>
    {campaign.scheduled_at && !campaign.sent_at && (
      <p className="text-xs text-amber-500 mt-1 font-medium">
        Scheduled: {new Date(campaign.scheduled_at).toLocaleString()}
      </p>
    )}
  </div>
  <div className="group flex items-center gap-3 flex-shrink-0">
    ...buttons...
  </div>
</div>
```

with:

```tsx
<CampaignDetailHeader
  campaignId={campaign.id}
  campaignName={campaign.name}
  campaignDate={campaign.campaign_date}
  scheduledAt={campaign.scheduled_at}
  sentAt={campaign.sent_at}
  closedAt={campaign.closed_at}
/>

<div className="flex items-start justify-between gap-4 mb-6">
  <div>{/* spacer - name moved to header */}</div>
  <div className="group flex items-center gap-3 flex-shrink-0">
    <StatusBadge sentAt={campaign.sent_at} closedAt={campaign.closed_at} />
    {isDraft && <DeleteCampaignButton campaignId={campaign.id} redirectAfter />}
    <DuplicateCampaignButton
      campaignId={campaign.id}
      sourceName={campaign.name}
      sourceDate={campaign.campaign_date}
    />
    {campaign.sent_at && (
      <Link
        href={`/admin/campaigns/${campaign.id}/qr`}
        className="border border-zinc-200 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
      >
        {/* translated by client import — keep as plain string here, ResultCard pattern can be used in future */}
        View QR Codes
      </Link>
    )}
    {campaign.sent_at && (
      <a href={`/api/campaigns/${campaign.id}/export`} download
        className="border border-zinc-200 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors">
        Export CSV
      </a>
    )}
    {campaign.sent_at && !campaign.closed_at && (
      <ReminderButton campaignId={campaign.id} tokens={allTokens} />
    )}
    {canClose && <CloseCampaignButton campaignId={campaign.id} />}
    {canLaunch && <LaunchButton campaignId={campaign.id} employeeCount={allTokens.length} />}
  </div>
</div>
```

Note: "View QR Codes" and "Export CSV" are in server-rendered anchor tags. Add a `CampaignActionButtons.tsx` client component if full translation of these labels is required in a future pass; for now the structural strings (campaign name, breadcrumb, scheduled label) are translated.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/CampaignDetailHeader.tsx src/app/admin/campaigns/
git commit -m "feat: extract CampaignDetailHeader, translate campaign detail breadcrumb and scheduled label"
```

---

## Task 16: RTL Tailwind class audit

**Files:**
- Modify: `src/app/scan/page.tsx` (already done in Task 7)
- Modify: `src/app/admin/employees/page.tsx` (already done in Task 14)
- Modify: `src/components/admin/TeamPageUI.tsx` (already done in Task 11)
- Audit and fix remaining directional classes across all modified files

- [ ] **Step 1: Find remaining directional Tailwind classes**

```bash
grep -rn '\btext-left\b\|\btext-right\b\|\bml-\|\bmr-\|\bpl-\|\bpr-\|\bleft-\b\|\bright-\b' \
  src/app/gift/page.tsx \
  src/app/scan/page.tsx \
  src/app/\(auth\)/login/page.tsx \
  src/app/unauthorized/page.tsx \
  src/components/admin/Sidebar.tsx \
  src/components/platform/PlatformSidebar.tsx \
  src/components/admin/AdminDashboardUI.tsx \
  src/components/admin/TeamPageUI.tsx \
  src/components/admin/SettingsForm.tsx \
  src/app/admin/employees/page.tsx \
  src/app/admin/campaigns/new/page.tsx \
  src/components/verify/ResultCard.tsx \
  src/components/ui/LanguageToggle.tsx
```

- [ ] **Step 2: Fix each directional class**

Apply these replacements where layout should mirror in RTL:

| Class | Replacement | When to apply |
|-------|-------------|---------------|
| `text-left` | `text-start` | Table `<th>`, form labels, paragraph alignment |
| `text-right` | `text-end` | Table action columns, right-aligned text |
| `ml-auto` | `ms-auto` | Push-right spacing |
| `mr-auto` | `me-auto` | Push-left spacing |
| `left-N` (absolute positioned UI) | `start-N` | Language toggle, back button |
| `right-N` (absolute positioned UI) | `end-N` | History button |

Do NOT replace `left`/`right` on:
- The QR scan corner markers (they're visual symmetry, not directional)
- The scan line animation (visual effect)
- Icon SVG paths

Run the search from Step 1 again after fixes to confirm no directional classes remain in the listed files.

- [ ] **Step 3: Verify TypeScript compiles and dev server runs**

```bash
npx tsc --noEmit && npm run dev
```

Expected: no errors, dev server starts

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add -p  # stage only the directional-class fixes
git commit -m "fix: migrate directional Tailwind classes to logical properties for RTL support"
```

---

## Task 17: Final verification

- [ ] **Step 1: Test EN → HE toggle on gift page**

Start dev server (`npm run dev`), visit `http://localhost:3000/gift`. Click `עברית` — page text becomes Hebrew, layout switches to RTL. Click `EN` — returns to English LTR.

- [ ] **Step 2: Test scan page RTL**

Visit `http://localhost:3000/scan` in Hebrew mode. Confirm: ← Admin button appears on the right (RTL start), History button appears on the left (RTL end).

- [ ] **Step 3: Test verify page**

The `/verify/[token]` page is server-rendered. The `ResultCard` is a client component that reads locale from context on hydration. Test: set locale to Hebrew, visit a verify URL — result title and subtitle should appear in Hebrew.

- [ ] **Step 4: Test persistence**

Set language to Hebrew. Close and reopen the browser tab. Language should still be Hebrew (localStorage persists).

- [ ] **Step 5: Run tests**

```bash
npm test
```

Expected: all tests pass, including `tests/lib/i18n.test.ts`

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete Hebrew/RTL support across GiftFlow"
```
