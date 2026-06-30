'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/useT'
import { DatePicker } from '@/components/admin/DatePicker'

type Props = {
  campaignId: string
  sourceName: string
  sourceDate: string | null
  className?: string
}

export function DuplicateCampaignButton({ campaignId, sourceName, sourceDate, className }: Props) {
  const t = useT()
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState(`${t('Copy of')} ${sourceName}`)
  const [date, setDate] = useState(sourceDate ?? '')
  const [copyEmployees, setCopyEmployees] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleDuplicate(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, campaign_date: date || null, copyEmployees }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? t('Failed to duplicate campaign'))
        return
      }
      router.push(`/admin/campaigns/${data.id}`)
    } catch {
      setError(t('Network error — please try again'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={(e) => { e.preventDefault(); setError(null); setShowModal(true) }}
        className={className ?? 'border border-zinc-200 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover-brand transition-colors'}
      >
        {t('Duplicate campaign')}
      </button>

      {showModal && createPortal(
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-zinc-900 mb-5">{t('Duplicate campaign')}</h2>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
                {error}
              </p>
            )}

            <form onSubmit={handleDuplicate} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="dup-name" className="text-sm font-medium text-zinc-700">{t('Campaign name')}</label>
                <input
                  id="dup-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-brand focus:border-transparent"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="dup-date" className="text-sm font-medium text-zinc-700">{t('Campaign date')}</label>
                <DatePicker id="dup-date" value={date} onChange={setDate} />
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={copyEmployees}
                  onChange={(e) => setCopyEmployees(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-300 text-brand ring-brand"
                />
                <span className="text-sm text-zinc-700">{t('Copy employees from this campaign')}</span>
              </label>

              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-zinc-200 rounded-lg px-4 py-2 text-sm font-medium text-zinc-700 hover-brand transition-colors"
                >
                  {t('Cancel')}
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-brand text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all"
                >
                  {loading ? t('Duplicating…') : t('Duplicate')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
