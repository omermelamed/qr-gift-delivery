'use client'

import { useState } from 'react'

type Gift = {
  campaignName: string
  campaignDate: string | null
  companyName: string
  employeeName: string
}

export default function GiftPage() {
  const [phone, setPhone] = useState('')
  const [gifts, setGifts] = useState<Gift[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setGifts(null)
    try {
      const res = await fetch('/api/gift/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong')
        return
      }
      setGifts(data.gifts)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-start pt-16 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-zinc-900">Check Your Gift</h1>
          <p className="text-sm text-zinc-500 mt-1">Enter your phone number to see if you have an unclaimed gift.</p>
        </div>

        <form onSubmit={handleLookup} className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="phone" className="text-sm font-medium text-zinc-700">Phone number</label>
            <input
              id="phone"
              type="tel"
              placeholder="+1 (555) 000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent font-mono"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all"
          >
            {loading ? 'Looking up…' : 'Check'}
          </button>
        </form>

        {gifts !== null && (
          <div className="mt-6">
            {gifts.length === 0 ? (
              <div className="text-center bg-white rounded-2xl border border-zinc-200 p-8">
                <p className="text-zinc-500 text-sm">No unclaimed gifts found for this number.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {gifts.map((gift, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-zinc-200 p-5">
                    <p className="text-xs text-zinc-400 font-medium uppercase tracking-wide mb-1">{gift.companyName}</p>
                    <p className="font-semibold text-zinc-900">{gift.campaignName}</p>
                    {gift.campaignDate && (
                      <p className="text-sm text-zinc-400 mt-0.5">{gift.campaignDate}</p>
                    )}
                    <div className="mt-4 p-3 bg-indigo-50 rounded-lg">
                      <p className="text-sm text-indigo-700 font-medium">Hi {gift.employeeName}!</p>
                      <p className="text-sm text-indigo-600 mt-0.5">
                        You have an unclaimed gift. Find a gift distributor and show them this screen to claim it.
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
