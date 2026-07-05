'use client'

import { useState, type FormEvent } from 'react'
import { useT } from '@/lib/i18n/useT'
import { useLocale } from '@/lib/i18n/LanguageContext'

type Status = 'idle' | 'sending' | 'success' | 'error'

const inputClass =
  'w-full rounded-xl border border-indigo-800 bg-indigo-900/50 px-4 py-2.5 text-white placeholder:text-indigo-300/50 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/40'

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
      <div className="flex items-center justify-center rounded-2xl border border-indigo-800 bg-indigo-900/50 p-10 text-center">
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
          <input name="name" required maxLength={120} className={inputClass} />
        </label>
        <label className="grid gap-1.5 text-sm font-medium text-indigo-100">
          {t('Company')}
          <input name="company" required maxLength={120} className={inputClass} />
        </label>
      </div>
      <label className="grid gap-1.5 text-sm font-medium text-indigo-100">
        {t('Work email')}
        <input type="email" name="email" required maxLength={254} className={inputClass} />
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
        className="rounded-full bg-white px-6 py-3 text-base font-semibold text-indigo-950 transition-colors hover:bg-indigo-100 disabled:opacity-60"
      >
        {status === 'sending' ? t('Sending…') : t('Send')}
      </button>
    </form>
  )
}
