'use client'

import { useState } from 'react'

type Props = { campaignId: string; unredeemedCount: number }

export function ReminderButton({ campaignId, unredeemedCount }: Props) {
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ dispatched: number; failed: number } | null>(null)

  if (unredeemedCount === 0) return null

  async function handleSend() {
    setLoading(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/resend`, { method: 'POST' })
      const data = await res.json()
      setResult({ dispatched: data.dispatched ?? 0, failed: data.failed ?? 0 })
    } catch {
      setResult({ dispatched: 0, failed: unredeemedCount })
    } finally {
      setLoading(false)
      setShowModal(false)
    }
  }

  return (
    <>
      {result && (
        <span className="text-xs text-zinc-500">
          Sent {result.dispatched}{result.failed > 0 ? `, ${result.failed} failed` : ''}
        </span>
      )}
      <button
        onClick={() => setShowModal(true)}
        disabled={loading}
        className="border border-zinc-200 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors disabled:opacity-50"
      >
        Resend to unredeemed ({unredeemedCount})
      </button>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-base font-semibold text-zinc-900 mb-2">Resend reminder?</h2>
            <p className="text-sm text-zinc-500 mb-5">
              This will send a new SMS with the QR code to {unredeemedCount} employee{unredeemedCount !== 1 ? 's' : ''} who haven&apos;t redeemed yet.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 border border-zinc-200 rounded-lg px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={loading}
                className="flex-1 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all"
              >
                {loading ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
