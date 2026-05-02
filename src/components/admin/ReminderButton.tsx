'use client'

import { useState } from 'react'
import { ResendModal } from '@/components/admin/ResendModal'

type TokenSlice = {
  id: string
  employee_name: string
  department: string | null
  redeemed: boolean
  sms_sent_at: string | null
}

type Props = {
  campaignId: string
  tokens: TokenSlice[]
}

export function ReminderButton({ campaignId, tokens }: Props) {
  const [showModal, setShowModal] = useState(false)
  const [result, setResult] = useState<{ dispatched: number; failed: number } | null>(null)

  const unredeemedCount = tokens.filter((t) => !t.redeemed).length
  if (unredeemedCount === 0) return null

  return (
    <>
      {result && (
        <span className="text-xs text-zinc-500">
          Sent {result.dispatched}{result.failed > 0 ? `, ${result.failed} failed` : ''}
        </span>
      )}
      <button
        onClick={() => setShowModal(true)}
        className="border border-zinc-200 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
      >
        Resend SMS ({unredeemedCount})
      </button>

      {showModal && (
        <ResendModal
          campaignId={campaignId}
          tokens={tokens}
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
