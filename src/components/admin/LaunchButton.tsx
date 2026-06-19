'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useT } from '@/lib/i18n/useT'

type Props = {
  campaignId: string
  employeeCount: number
  creditBalance: number
  scheduledAt?: string | null
  scheduledConfirmedAt?: string | null
}

export function LaunchButton({ campaignId, employeeCount, creditBalance, scheduledAt, scheduledConfirmedAt }: Props) {
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const t = useT()

  const hasSchedule = !!scheduledAt
  const isConfirmed = !!scheduledConfirmedAt
  const insufficientCredits = creditBalance < employeeCount

  async function handleLaunch() {
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

  async function patchCampaign(body: Record<string, unknown>) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? t('Something went wrong'))
        return
      }
      router.refresh()
    } catch {
      setError(t('Network error — please try again'))
    } finally {
      setLoading(false)
    }
  }

  const errorBanner = error && (
    <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-2">
      {error}
    </p>
  )

  // State 1: Confirmed schedule → show badge + cancel (whether time is future or past/sending)
  if (hasSchedule && isConfirmed) {
    const scheduledDate = new Date(scheduledAt!)
    const isPast = scheduledDate <= new Date()
    return (
      <>
        {errorBanner}
        <div className="flex items-center gap-2">
          <span className={`rounded-lg px-4 py-2.5 text-sm font-medium border ${isPast ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
            {isPast ? t('Sending soon…') : `${t('Scheduled:')} ${scheduledDate.toLocaleString(undefined, { hour12: false })}`}
          </span>
          {!isPast && (
            <button
              onClick={() => patchCampaign({ cancelConfirmation: true })}
              disabled={loading}
              className="border border-zinc-200 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors disabled:opacity-50"
            >
              {loading ? '…' : t('Cancel schedule')}
            </button>
          )}
        </div>
      </>
    )
  }

  // State 2: Has schedule but not confirmed → show confirm button + cancel
  if (hasSchedule && !isConfirmed) {
    const scheduledDate = new Date(scheduledAt!)
    return (
      <>
        {errorBanner}
        <div className="flex items-center gap-2">
          <span className="text-xs text-amber-600 font-medium">
            {scheduledDate.toLocaleString(undefined, { hour12: false })}
          </span>
          <button
            onClick={() => patchCampaign({ confirmSchedule: true })}
            disabled={loading || insufficientCredits}
            className="bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-lg px-5 py-2.5 text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? '…' : insufficientCredits ? t('Insufficient credits') : t('Confirm Schedule')}
          </button>
          <button
            onClick={() => patchCampaign({ scheduledAt: null })}
            disabled={loading}
            className="border border-zinc-200 rounded-lg px-3 py-2.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors disabled:opacity-50"
          >
            {t('Cancel schedule')}
          </button>
        </div>
      </>
    )
  }

  // State 3: No schedule → show launch button
  return (
    <>
      {errorBanner}
      <button
        onClick={() => setShowModal(true)}
        disabled={insufficientCredits}
        className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-5 py-2.5 text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {insufficientCredits ? t('Insufficient credits') : t('🚀 Launch Campaign')}
      </button>
      {showModal && (
        <ConfirmModal
          title={t('Launch campaign?')}
          message={`This will send QR codes via SMS to ${employeeCount} employee${employeeCount === 1 ? '' : 's'}. ${t('This cannot be undone.')}`}
          confirmLabel={t('Launch')}
          loading={loading}
          onConfirm={handleLaunch}
          onCancel={() => setShowModal(false)}
        />
      )}
    </>
  )
}
