'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/useT'
import { SmsLengthHint } from '@/components/admin/SmsLengthHint'

type Props = {
  campaignId: string
  initial: string | null
  companyDefault: string | null
}

export function CampaignSmsTemplate({ campaignId, initial, companyDefault }: Props) {
  const t = useT()
  const router = useRouter()
  const [value, setValue] = useState(initial ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    const trimmed = value.trim()
    if (trimmed !== '' && !trimmed.includes('{link}')) {
      setError(t('The message must contain {link}.'))
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ smsTemplate: trimmed === '' ? null : trimmed }),
      })
      if (!res.ok) {
        setError(t('Could not save. Please try again.'))
      } else {
        router.refresh()
      }
    } catch {
      setError(t('Could not save. Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  const placeholder = companyDefault?.trim()
    ? companyDefault
    : t('Use {name} for the recipient and {link} for the gift link.')

  return (
    <div className="flex flex-col gap-2 bg-white rounded-2xl border border-zinc-200 p-4">
      <span className="text-sm font-medium text-zinc-900">{t('SMS message')}</span>
      <textarea
        rows={4}
        value={value}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-brand resize-none"
      />
      <span className="text-xs text-zinc-500">
        {t('Use {name} for the recipient and {link} for the gift link.')}{' '}
        {t('Leave empty to use the default from Settings.')}
      </span>
      <SmsLengthHint template={value} />
      {error && <span className="text-xs text-red-500">{error}</span>}
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="self-start bg-brand text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
      >
        {busy ? t('Saving…') : t('Save')}
      </button>
    </div>
  )
}
