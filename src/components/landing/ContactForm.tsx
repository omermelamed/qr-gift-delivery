'use client'

import { useState, type FormEvent } from 'react'
import { useT } from '@/lib/i18n/useT'
import { useLocale } from '@/lib/i18n/LanguageContext'

type Status = 'idle' | 'sending' | 'success' | 'error'

const inputClass =
  'w-full rounded-xl border border-indigo-800 bg-indigo-900/50 px-4 py-2.5 text-white placeholder:text-indigo-300/50 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/40'

// Emerald check that fades in via CSS :user-valid (see globals.css).
function ValidCheck() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="valid-check pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-400"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}

export function ContactForm() {
  const t = useT()
  const { locale } = useLocale()
  const [status, setStatus] = useState<Status>('idle')

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (status === 'sending') return
    const data = new FormData(e.currentTarget)
    setStatus('sending')
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: data.get('name'),
          company: data.get('company'),
          email: data.get('email'),
          phone: data.get('phone'),
          message: data.get('message'),
          website: data.get('website'),
          locale,
        }),
      })
      if (!res.ok) throw new Error(`leads responded ${res.status}`)
      setStatus('success')
    } catch {
      setStatus('error')
    }
  }

  if (status === 'success') {
    return (
      <div className="rounded-2xl border border-indigo-800 bg-indigo-900/50 p-10 text-center">
        <svg viewBox="0 0 52 52" className="mx-auto mb-4 h-12 w-12 text-emerald-400" aria-hidden="true">
          <circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="2" className="draw-stroke-1" />
          <path d="M15 27l8 8 15-15" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="draw-stroke-2" />
        </svg>
        <p className="text-lg font-medium">{t("Thanks! We'll be in touch within one business day.")}</p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="relative grid gap-4">
      {/* Honeypot — invisible to real users; the API drops submissions that fill it. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute h-0 w-0 overflow-hidden opacity-0"
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium text-indigo-100">
          {t('Full name')}
          <span className="relative block">
            <input name="name" required maxLength={120} className={inputClass} />
            <ValidCheck />
          </span>
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-indigo-100">
          {t('Company')}
          <span className="relative block">
            <input name="company" required maxLength={120} className={inputClass} />
            <ValidCheck />
          </span>
        </label>
      </div>
      <label className="grid gap-1.5 text-sm font-medium text-indigo-100">
        {t('Work email')}
        <span className="relative block">
          <input type="email" name="email" required maxLength={254} className={inputClass} />
          <ValidCheck />
        </span>
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-indigo-100">
        {t('Phone (optional)')}
        <input type="tel" name="phone" maxLength={32} className={inputClass} />
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-indigo-100">
        {t('Message (optional)')}
        <textarea name="message" rows={4} maxLength={2000} className={inputClass} />
      </label>
      {status === 'error' && (
        <p role="alert" className="text-sm font-medium text-rose-300">
          {t("Something went wrong. Your message wasn't sent — please try again.")}
        </p>
      )}
      <button
        type="submit"
        disabled={status === 'sending'}
        className="rounded-full bg-white px-6 py-3 text-base font-semibold text-indigo-950 transition hover:bg-indigo-100 disabled:opacity-60 motion-safe:hover:-translate-y-px"
      >
        {status === 'sending' ? (
          <span className="inline-flex items-center justify-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 animate-spin" aria-hidden="true">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
              <path d="M22 12a10 10 0 0 1-10 10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
            </svg>
            {t('Sending…')}
          </span>
        ) : (
          t('Send')
        )}
      </button>
    </form>
  )
}
