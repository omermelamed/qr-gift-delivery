'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/useT'
import { SmsLengthHint } from '@/components/admin/SmsLengthHint'
import { ResendModal } from '@/components/admin/ResendModal'

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
  initial: string | null
  effectivePrimaryTemplate: string | null
  tokens?: TokenSlice[]
  showTitle?: boolean
}

export function ReminderSmsTemplate({ campaignId, initial, effectivePrimaryTemplate, tokens, showTitle = true }: Props) {
  const t = useT()
  const router = useRouter()
  const [value, setValue] = useState(initial ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showModal, setShowModal] = useState(false)
  const [result, setResult] = useState<{ dispatched: number; failed: number } | null>(null)

  const unredeemedCount = tokens?.filter((tok) => !tok.redeemed && !!tok.phone_number).length ?? 0
  const isDirty = value.trim() !== (initial ?? '').trim()

  async function save(): Promise<boolean> {
    const trimmed = value.trim()
    if (trimmed !== '' && !trimmed.includes('{name}')) {
      setError(t('The message must contain {name}.'))
      return false
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/reminder-template`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reminderSmsTemplate: trimmed === '' ? null : trimmed }),
      })
      if (!res.ok) {
        setError(t('Could not save. Please try again.'))
        return false
      }
      router.refresh()
      return true
    } catch {
      setError(t('Could not save. Please try again.'))
      return false
    } finally {
      setBusy(false)
    }
  }

  async function handleAction() {
    if (unredeemedCount === 0) {
      await save()
      return
    }
    if (isDirty) {
      const saved = await save()
      if (saved) setShowModal(true)
    } else {
      setShowModal(true)
    }
  }

  const hasPrimary = !!effectivePrimaryTemplate?.trim()
  const placeholder = hasPrimary
    ? effectivePrimaryTemplate!
    : t('Use {name} for the recipient (required) and {link} for the gift link (optional).')
  const helperText = t('Leave empty to use the original message.')

  const buttonLabel = busy
    ? t('Saving…')
    : unredeemedCount === 0
      ? t('Save')
      : isDirty
        ? `${t('Save & Resend')} (${unredeemedCount})`
        : `${t('Resend')} (${unredeemedCount})`

  return (
    <div className="flex flex-col gap-2 bg-white rounded-2xl border border-zinc-200 p-4">
      {showTitle && <span className="text-sm font-medium text-zinc-900">{t('Reminder message')}</span>}
      <textarea
        rows={4}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-brand resize-none"
      />
      <span className="text-xs text-zinc-500">
        {t('Use {name} for the recipient (required) and {link} for the gift link (optional).')}{' '}
        {helperText}
      </span>
      <SmsLengthHint template={value} />
      {error && <span className="text-xs text-red-500">{error}</span>}
      {result && (
        <span className="text-xs text-zinc-500">
          {t('Sent')} {result.dispatched}{result.failed > 0 ? `, ${result.failed} ${t('failed')}` : ''}
        </span>
      )}
      <button
        type="button"
        onClick={handleAction}
        disabled={busy}
        className="self-start bg-brand text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {buttonLabel}
      </button>

      {showModal && tokens && (
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
    </div>
  )
}
