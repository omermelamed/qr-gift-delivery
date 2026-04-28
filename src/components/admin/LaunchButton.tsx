'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function LaunchButton({ campaignId }: { campaignId: string }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleLaunch() {
    if (!confirm('Launch campaign and send SMS to all employees?')) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/send`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Launch failed'); return }
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {error && <p className="text-sm text-red-600 mb-2 bg-red-50 rounded px-3 py-2">{error}</p>}
      <button
        onClick={handleLaunch}
        disabled={loading}
        className="bg-black text-white rounded-lg px-5 py-2.5 text-sm font-medium disabled:opacity-50 hover:bg-gray-800 transition-colors"
      >
        {loading ? 'Launching…' : 'Launch Campaign'}
      </button>
    </div>
  )
}
