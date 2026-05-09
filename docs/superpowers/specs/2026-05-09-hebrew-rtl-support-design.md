# Hebrew / RTL Support — Design Spec

Date: 2026-05-09

## Summary

Add Hebrew language support with right-to-left layout across the entire GiftFlow app. Language choice is per-user, stored in `localStorage`, toggled via a UI button. English strings stay hardcoded in components; Hebrew translations live in a single file.

---

## Section 1: Core Infrastructure

### New files

**`src/lib/i18n/translations.he.ts`**
A flat `Record<string, string>` mapping English UI strings (used as keys) to their Hebrew equivalents. English is never in this file — it is the implicit fallback.

**`src/lib/i18n/LanguageContext.tsx`**
- React context holding `locale: 'en' | 'he'` and `setLocale`
- `LanguageProvider` reads initial locale from `localStorage` on mount (key: `"giftflow-locale"`)
- Writes back to `localStorage` and sets a cookie (name: `"giftflow-locale"`) on change
- Side effect: sets `document.documentElement.lang` and `document.documentElement.dir` (`'rtl'` for Hebrew, `'ltr'` for English)
- Exports `useLocale()` hook

**`src/lib/i18n/useT.ts`**
- Calls `useLocale()`
- Returns `t(key: string) => string`
- When `locale === 'he'`: looks up key in `translations.he.ts`, falls back to key if missing
- When `locale === 'en'`: always returns key unchanged

### Root layout change
`LanguageProvider` wraps the `<body>` in `src/app/layout.tsx`. The `lang` and `dir` attributes on `<html>` are controlled dynamically by the provider's side effect.

---

## Section 2: RTL Layout

### Mechanism
Tailwind CSS v4's `rtl:` variant activates automatically when `dir="rtl"` is on any ancestor element. Since `<html>` gets `dir="rtl"` for Hebrew, all `rtl:` classes in the component tree activate globally.

### Class migrations (per audit)
Replace directional Tailwind classes with logical equivalents where layout should mirror:

| Old class | Replacement |
|-----------|-------------|
| `ml-*` / `mr-*` | `ms-*` / `me-*` |
| `pl-*` / `pr-*` | `ps-*` / `pe-*` |
| `text-left` | `text-start` |
| `text-right` | `text-end` |
| `left-*` / `right-*` (positioned) | `start-*` / `end-*` or `rtl:` variant |

Flex row direction is left as-is — browsers reverse visual order automatically under `dir="rtl"`.

### Hebrew font
Load Heebo (or Noto Sans Hebrew) from Google Fonts alongside Inter. Apply via:
```css
:lang(he) {
  font-family: 'Heebo', sans-serif;
}
```

---

## Section 3: Language Toggle UI

### Component
`src/components/ui/LanguageToggle.tsx` — renders `EN | עברית` as a pill toggle button. Calls `setLocale` from `useLocale()`.

### Placement
Fixed-position floating button (bottom-end corner) so it works across all layouts without per-layout changes. Uses `end-4 bottom-4` (logical property) so it stays on the correct side in both LTR and RTL.

---

## Section 4: Translation Coverage

### Pages to translate

| Page | Route | Notes |
|------|-------|-------|
| Gift lookup | `/gift` | Headings, labels, placeholders, button, errors |
| Verify result | `/verify/[token]` | Server component — see below |
| Scan | `/scan` | Scan states, history, gift picker |
| Admin dashboard | `/admin/*` | Sidebar, tables, buttons, modals, status badges |
| Platform | `/platform/*` | Company list, new company modal |
| Auth/error | `/login`, `/unauthorized` | Login prompt, error messages |

### Server component handling (verify page)
`/verify/[token]/page.tsx` is a server component and cannot use `useT()`. Solution:
- The inline `Result` component is extracted to `src/components/verify/ResultCard.tsx` as a client component
- `ResultCard` reads locale from a cookie (name: `"giftflow-locale"`) that `LanguageProvider` sets alongside `localStorage`
- `ResultCard` uses `useT()` internally to translate the `title` and `subtitle` props

The server page passes untranslated English strings as props to `ResultCard`; the client component does the translation rendering.

---

## Out of Scope

- URL-based routing (`/en/`, `/he/`)
- Full extraction of English strings into `en.json`
- Server-side locale detection from `Accept-Language`
- Pluralization rules or date/number formatting
