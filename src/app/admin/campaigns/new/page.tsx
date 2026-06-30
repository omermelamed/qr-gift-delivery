'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useT } from '@/lib/i18n/useT'
import { DatePicker } from '@/components/admin/DatePicker'

export default function NewCampaignPage() {
  const t = useT()
  const [name, setName] = useState('')
  const [campaignDate, setCampaignDate] = useState('')
  const [supportsArrival, setSupportsArrival] = useState(false)
  const [maxAttendees, setMaxAttendees] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!campaignDate) {
      setError(t('Please choose a campaign date.'))
      return
    }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          campaignDate,
          supportsArrivalCertificates: supportsArrival,
          maxAttendeeCount: supportsArrival && maxAttendees.trim() !== '' ? Number(maxAttendees) : null,
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
      <Link href="/admin" className="text-sm text-zinc-400 hover-brand-text transition-colors mb-6 inline-block">
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
            className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-brand focus:border-transparent"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="date" className="text-sm font-medium text-zinc-700">{t('Campaign date')}</label>
          <DatePicker id="date" value={campaignDate} onChange={setCampaignDate} />
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={supportsArrival}
            onChange={(e) => setSupportsArrival(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-indigo-500"
          />
          <span>
            <span className="block text-sm font-medium text-zinc-700">{t('Supports Arrival Certificates')}</span>
            <span className="block text-xs text-zinc-500">{t('Let people confirm attendance and how many are coming.')}</span>
          </span>
        </label>

        {supportsArrival && (
          <div className="flex flex-col gap-1.5 ps-7">
            <label htmlFor="max-attendees" className="text-sm font-medium text-zinc-700">
              {t('Max people per invite (including the employee)')}
            </label>
            <input
              id="max-attendees"
              type="number"
              min={1}
              step={1}
              value={maxAttendees}
              placeholder={t('No limit')}
              onChange={(e) => setMaxAttendees(e.target.value)}
              className="w-32 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-brand focus:border-transparent"
            />
            <span className="text-xs text-zinc-500">{t('e.g. 5 = the person plus up to 4 guests.')}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-brand text-white rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all mt-1"
        >
          {loading ? t('Creating…') : t('Create Campaign')}
        </button>
      </form>
    </div>
  )
}
