'use client'

import { useState } from 'react'
import { ResendModal } from '@/components/admin/ResendModal'
import { useT } from '@/lib/i18n/useT'

type TokenSlice = {
  id: string
  employee_name: string
  department: string | null
  phone_number: string | null
  redeemed: boolean
  sms_sent_at: string | null
}

type Props = {
  campaignId: string
  tokens: TokenSlice[]
  creditBalance: number
  className?: string
}

export function ReminderButton({ campaignId, tokens, creditBalance, className }: Props) {
  const t = useT()
  const [showModal, setShowModal] = useState(false)
  const [result, setResult] = useState<{ dispatched: number; failed: number } | null>(null)

  const unredeemedCount = tokens.filter((t) => !t.redeemed && !!t.phone_number).length
  if (unredeemedCount === 0) return null

  return (
    <>
      {result && (
        <span className="text-xs text-zinc-500">
          {t('Sent')} {result.dispatched}{result.failed > 0 ? `, ${result.failed} ${t('failed')}` : ''}
        </span>
      )}
      <button
        onClick={() => setShowModal(true)}
        className={className ?? 'border border-zinc-200 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover-brand transition-colors'}
      >
        {t('Resend SMS').replace('({count})', '')} ({unredeemedCount})
      </button>

      {showModal && (
        <ResendModal
          campaignId={campaignId}
          tokens={tokens}
          creditBalance={creditBalance}
          onClose={() => setShowModal(false)}
          onDone={(dispatched, failed) => {
            setResult({ dispatched, failed })
            setShowModal(false)
          }}
        />
      )}
    </>
  )
}
