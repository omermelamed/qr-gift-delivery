'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useT } from '@/lib/i18n/useT'

export function LaunchButton({ campaignId, employeeCount, creditBalance }: { campaignId: string; employeeCount: number; creditBalance: number }) {
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const t = useT()

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

  const insufficientCredits = creditBalance < employeeCount
  const disabledTooltip = insufficientCredits
    ? t('Not enough credits — you need {needed} but have {available}')
        .replace('{needed}', String(employeeCount))
        .replace('{available}', String(creditBalance))
    : undefined

  return (
    <>
      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-2">
          {error}
        </p>
      )}
      <span title={disabledTooltip} className="inline-flex">
        <button
          onClick={() => setShowModal(true)}
          disabled={insufficientCredits}
          className="bg-brand text-white rounded-lg px-5 h-[34px] inline-flex items-center justify-center text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {t('🚀 Launch Campaign')}
        </button>
      </span>
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
