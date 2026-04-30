'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Props = {
  campaignId: string
  sourceName: string
  sourceDate: string | null
}

export function DuplicateCampaignButton({ campaignId, sourceName, sourceDate }: Props) {
  const [showModal, setShowModal] = useState(false)
  const [name, setName] = useState(`Copy of ${sourceName}`)
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
        setError(data.error ?? 'Failed to duplicate campaign')
        return
      }
      router.push(`/admin/campaigns/${data.id}`)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={(e) => { e.preventDefault(); setError(null); setShowModal(true) }}
        aria-label="Duplicate campaign"
        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors opacity-0 group-hover:opacity-100"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      </button>

      {showModal && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-lg font-semibold text-zinc-900 mb-5">Duplicate campaign</h2>

            {error && (
              <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
                {error}
              </p>
            )}

            <form onSubmit={handleDuplicate} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="dup-name" className="text-sm font-medium text-zinc-700">Campaign name</label>
                <input
                  id="dup-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="dup-date" className="text-sm font-medium text-zinc-700">Campaign date</label>
                <input
                  id="dup-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={copyEmployees}
                  onChange={(e) => setCopyEmployees(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-zinc-700">Copy employees from this campaign</span>
              </label>

              <div className="flex gap-3 mt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 border border-zinc-200 rounded-lg px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all"
                >
                  {loading ? 'Duplicating…' : 'Duplicate'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
