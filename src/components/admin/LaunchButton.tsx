'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useT } from '@/lib/i18n/useT'

export function LaunchButton({ campaignId, employeeCount, creditBalance, scheduledAt }: { campaignId: string; employeeCount: number; creditBalance: number; scheduledAt?: string | null }) {
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const t = useT()

  const isScheduled = !!(scheduledAt && new Date(scheduledAt) > new Date())

  async function handleConfirm() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/send`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? t('Launch failed'))
        setShowModal(false)
        return
      }
      router.refresh()
    } catch {
      setError(t('Network error — please try again'))
    } finally {
      setLoading(false)
      setShowModal(false)
    }
  }

  async function handleClearSchedule() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduledAt: null }),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? t('Failed to clear schedule'))
        return
      }
      router.refresh()
    } catch {
      setError(t('Network error — please try again'))
    } finally {
      setLoading(false)
    }
  }

  if (isScheduled) {
    const scheduledDate = new Date(scheduledAt!)
    return (
      <>
        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-2">
            {error}
          </p>
        )}
        <div className="flex items-center gap-2">
          <span className="bg-amber-50 text-amber-700 border border-amber-200 rounded-lg px-4 py-2.5 text-sm font-medium">
            {t('Scheduled:')} {scheduledDate.toLocaleString(undefined, { hour12: false })}
          </span>
          <button
            onClick={handleClearSchedule}
            disabled={loading}
            className="border border-zinc-200 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors disabled:opacity-50"
          >
            {loading ? '…' : t('Cancel schedule')}
          </button>
        </div>
      </>
    )
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
        disabled={creditBalance < employeeCount}
        className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-5 py-2.5 text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {creditBalance < employeeCount ? t('Insufficient credits') : t('🚀 Launch Campaign')}
      </button>
      {showModal && (
        <ConfirmModal
          title={t('Launch campaign?')}
          message={`This will send QR codes via SMS to ${employeeCount} employee${employeeCount === 1 ? '' : 's'}. ${t('This cannot be undone.')}`}
          confirmLabel={t('Launch')}
          loading={loading}
          onConfirm={handleConfirm}
          onCancel={() => setShowModal(false)}
        />
      )}
    </>
  )
}
