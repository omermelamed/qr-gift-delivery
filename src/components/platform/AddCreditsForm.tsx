'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export function AddCreditsForm({
  companyId,
  currentBalance,
}: {
  companyId: string
  currentBalance: number
}) {
  const [amount, setAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const num = Number(amount)
    if (!num || num <= 0 || !Number.isInteger(num)) {
      setError('Enter a positive whole number')
      return
    }

    setLoading(true)
    setError(null)
    const res = await fetch(`/api/platform/companies/${companyId}/credits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: num }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? 'Failed to add credits')
    } else {
      setAmount('')
      router.refresh()
    }
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-end gap-3">
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-zinc-500">Add credits</label>
        <input
          type="number"
          min="1"
          step="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="e.g. 500"
          className="border border-zinc-200 rounded-lg px-3 py-2 text-sm w-40 focus:outline-none focus:ring-2 ring-brand focus:border-transparent"
        />
      </div>
      <button
        type="submit"
        disabled={loading || !amount}
        className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-50"
      >
        {loading ? 'Adding…' : 'Add'}
      </button>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </form>
  )
}
