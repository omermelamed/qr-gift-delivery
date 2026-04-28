'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmModal } from '@/components/ui/ConfirmModal'

export function LaunchButton({ campaignId, employeeCount }: { campaignId: string; employeeCount: number }) {
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/send`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Launch failed')
        setShowModal(false)
        return
      }
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
      setShowModal(false)
    }
  }

  return (
    <>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-2">
          {error}
        </p>
      )}
      <button
        onClick={() => setShowModal(true)}
        className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-5 py-2.5 text-sm font-semibold hover:brightness-110 transition-all"
      >
        🚀 Launch Campaign
      </button>
      {showModal && (
        <ConfirmModal
          title="Launch campaign?"
          message={`This will send QR codes via SMS to ${employeeCount} employee${employeeCount === 1 ? '' : 's'}. This cannot be undone.`}
          confirmLabel="Launch"
          loading={loading}
          onConfirm={handleConfirm}
          onCancel={() => setShowModal(false)}
        />
      )}
    </>
  )
}
