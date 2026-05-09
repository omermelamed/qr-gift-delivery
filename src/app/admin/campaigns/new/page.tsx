'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useT } from '@/lib/i18n/useT'

export default function NewCampaignPage() {
  const t = useT()
  const [name, setName] = useState('')
  const [campaignDate, setCampaignDate] = useState('')
  const [scheduledAt, setScheduledAt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          campaignDate,
          scheduledAt: scheduledAt || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to create campaign'); return }
      router.push(`/admin/campaigns/${data.id}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-8 max-w-lg mx-auto">
      <Link href="/admin" className="text-sm text-zinc-400 hover:text-zinc-700 transition-colors mb-6 inline-block">
        {t('← Campaigns')}
      </Link>

      <h1 className="text-2xl font-bold text-zinc-900 mb-8">{t('New Campaign')}</h1>

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 flex flex-col gap-5">
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <label htmlFor="name" className="text-sm font-medium text-zinc-700">{t('Campaign name')}</label>
          <input
            id="name"
            type="text"
            placeholder={t('e.g. Passover 2026')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="date" className="text-sm font-medium text-zinc-700">{t('Campaign date')}</label>
          <input
            id="date"
            type="date"
            value={campaignDate}
            onChange={(e) => setCampaignDate(e.target.value)}
            required
            className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="scheduled" className="text-sm font-medium text-zinc-700">
            {t('Auto-send at')} <span className="text-zinc-400 font-normal">{t('(optional)')}</span>
          </label>
          <input
            id="scheduled"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
            className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <p className="text-xs text-zinc-400">{t('Leave blank to launch manually. Campaigns are checked hourly.')}</p>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all mt-1"
        >
          {loading ? t('Creating…') : t('Create Campaign')}
        </button>
      </form>
    </div>
  )
}
