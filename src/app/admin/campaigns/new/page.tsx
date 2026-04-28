'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function NewCampaignPage() {
  const [name, setName] = useState('')
  const [campaignDate, setCampaignDate] = useState('')
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
        body: JSON.stringify({ name, campaignDate }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to create campaign'); return }
      router.push(`/admin/campaigns/${data.id}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="p-8 max-w-lg mx-auto">
      <div className="mb-6">
        <Link href="/admin" className="text-sm text-gray-500 hover:underline">← Campaigns</Link>
      </div>
      <h1 className="text-2xl font-bold mb-8">New Campaign</h1>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4 bg-white rounded-xl shadow p-6">
        {error && <p className="text-sm text-red-600 bg-red-50 rounded px-3 py-2">{error}</p>}

        <label htmlFor="name" className="text-sm font-medium">Campaign name</label>
        <input
          id="name"
          type="text"
          placeholder="e.g. Passover 2026"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
        />

        <label htmlFor="date" className="text-sm font-medium">Campaign date</label>
        <input
          id="date"
          type="date"
          value={campaignDate}
          onChange={(e) => setCampaignDate(e.target.value)}
          required
          className="border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
        />

        <button
          type="submit"
          disabled={loading}
          className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 hover:bg-gray-800 transition-colors mt-2"
        >
          {loading ? 'Creating…' : 'Create Campaign'}
        </button>
      </form>
    </main>
  )
}
