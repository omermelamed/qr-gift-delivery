'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useT } from '@/lib/i18n/useT'

export function CloseCampaignButton({ campaignId }: { campaignId: string }) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const t = useT()

  async function handleClose() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/close`, { method: 'POST' })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Failed to close campaign')
        return
      }
      setShowConfirm(false)
      router.refresh()
    } catch {
      setError(t('Network error — please try again'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        className="border border-red-200 rounded-lg px-3 h-[34px] inline-flex items-center text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
      >
        {t('End campaign')}
      </button>

      {showConfirm && (
        <ConfirmModal
          title={t('End campaign?')}
          message={t('All unredeemed QR codes will stop working immediately. This cannot be undone.')}
          confirmLabel={t('End campaign')}
          loading={loading}
          error={error}
          onConfirm={handleClose}
          onCancel={() => { setShowConfirm(false); setError(null) }}
        />
      )}
    </>
  )
}
