'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/useT'

const ROLE_VALUES = [
  { value: 'company_admin', key: 'Admin' },
  { value: 'campaign_manager', key: 'Campaign Manager' },
  { value: 'scanner', key: 'Scanner (Distributor)' },
] as const

type Props = { onClose: () => void }

export function InviteMemberModal({ onClose }: Props) {
  const t = useT()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [roleName, setRoleName] = useState<string>('campaign_manager')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), phone: phone.trim(), role_name: roleName }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? t('Invite failed')); return }
      setSent(true)
      router.refresh()
    } catch {
      setError(t('Network error — please try again'))
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
        <div className="relative bg-white rounded-2xl shadow-xl border border-zinc-200 p-6 w-full max-w-sm text-center">
          <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="font-semibold text-zinc-900 mb-1">{t('Invite sent')}</p>
          <p className="text-sm text-zinc-500 mb-4">{email} {t('will receive an email with a link to set their password.')}</p>
          <button onClick={onClose} className="text-sm font-medium text-brand hover:underline">{t('Close')}</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl border border-zinc-200 p-6 w-full max-w-sm">
        <h2 className="text-base font-semibold text-zinc-900 mb-4">{t('Invite team member')}</h2>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="inv-name" className="text-sm font-medium text-zinc-700">{t('Full name')}</label>
            <input
              id="inv-name"
              type="text"
              placeholder={t('Jane Cohen')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-brand focus:border-transparent"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="inv-email" className="text-sm font-medium text-zinc-700">{t('Email')}</label>
            <input
              id="inv-email"
              type="email"
              placeholder="colleague@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-brand focus:border-transparent"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="inv-phone" className="text-sm font-medium text-zinc-700">{t('Phone')} <span className="text-xs text-zinc-400 font-normal">({t('optional')})</span></label>
            <input
              id="inv-phone"
              type="tel"
              dir="ltr"
              placeholder="+972..."
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="border border-zinc-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 ring-brand focus:border-transparent"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="inv-role" className="text-sm font-medium text-zinc-700">{t('Role')}</label>
            <select
              id="inv-role"
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
              className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-brand focus:border-transparent bg-white"
            >
              {ROLE_VALUES.map((r) => (
                <option key={r.value} value={r.value}>{t(r.key)}</option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 justify-end mt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-zinc-700 border border-zinc-200 rounded-lg hover-brand transition-colors disabled:opacity-50"
            >
              {t('Cancel')}
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim() || !email.trim()}
              className="px-4 py-2 text-sm font-semibold text-white bg-brand rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
            >
              {loading ? t('Sending…') : t('Send invite')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
