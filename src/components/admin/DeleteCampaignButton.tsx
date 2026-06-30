'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { useT } from '@/lib/i18n/useT'

export function DeleteCampaignButton({ campaignId, redirectAfter = false, className }: { campaignId: string; redirectAfter?: boolean; className?: string }) {
  const [showConfirm, setShowConfirm] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const t = useT()

  async function handleDelete() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? t('Failed to delete campaign'))
        return
      }
      setShowConfirm(false)
      if (redirectAfter) {
        router.push('/admin')
      } else {
        router.refresh()
      }
    } catch {
      setError(t('Network error — please try again'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowConfirm(true) }}
        className={className ?? 'border border-red-200 rounded-lg px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-50 transition-colors'}
      >
        {t('Delete')}
      </button>

      {showConfirm && (
        <ConfirmModal
          title={t('Delete campaign?')}
          message={t('This will permanently delete the campaign and all its employee records. This cannot be undone.')}
          confirmLabel={t('Delete')}
          loading={loading}
          error={error}
          onConfirm={handleDelete}
          onCancel={() => { setShowConfirm(false); setError(null) }}
        />
      )}
    </>
  )
}
