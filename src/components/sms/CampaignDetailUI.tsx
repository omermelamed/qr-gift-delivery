'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/useT'
import type { SmsCampaignStatus, SmsMessageStatus } from '@/types'

type Message = {
  id: string
  recipient_phone: string
  recipient_name: string | null
  status: SmsMessageStatus
  error_message: string | null
  sent_at: string | null
  delivered_at: string | null
}

type Campaign = {
  id: string
  name: string
  status: SmsCampaignStatus
  recipients_count: number
  sent_count: number
  failed_count: number
  credits_reserved: number
  created_at: string
  sent_at: string | null
}

type Template = {
  id: string
  name: string
  body_template: string
  variables: string[]
} | null

type Props = {
  campaign: Campaign
  messages: Message[]
  template: Template
  creditBalance: number
}

export function CampaignDetailUI({ campaign, messages, template, creditBalance }: Props) {
  const t = useT()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sendResult, setSendResult] = useState<{ sent: number; failed: number } | null>(null)

  const STATUS_STYLES: Record<SmsCampaignStatus, { label: string; color: string }> = {
    draft:      { label: t('Draft'), color: 'bg-zinc-100 text-zinc-600' },
    validating: { label: t('Validating'), color: 'bg-amber-100 text-amber-700' },
    sending:    { label: t('Sending'), color: 'bg-blue-100 text-blue-700' },
    sent:       { label: t('Sent'), color: 'bg-emerald-100 text-emerald-700' },
    failed:     { label: t('Failed'), color: 'bg-red-100 text-red-700' },
    cancelled:  { label: t('Cancelled'), color: 'bg-zinc-100 text-zinc-500' },
  }

  const MSG_STATUS: Record<SmsMessageStatus, { label: string; color: string }> = {
    pending:     { label: t('Pending'), color: 'text-zinc-400' },
    queued:      { label: t('Queued'), color: 'text-blue-500' },
    sent:        { label: t('Sent'), color: 'text-indigo-500' },
    delivered:   { label: t('Delivered'), color: 'text-emerald-500' },
    failed:      { label: t('Failed'), color: 'text-red-500' },
    undelivered: { label: t('Undelivered'), color: 'text-amber-500' },
  }

  const deliveryStats = messages.reduce(
    (acc, msg) => {
      if (msg.status === 'delivered') acc.delivered++
      else if (msg.status === 'failed' || msg.status === 'undelivered') acc.failed++
      else if (msg.status === 'sent' || msg.status === 'queued') acc.sent++
      else acc.pending++
      return acc
    },
    { delivered: 0, sent: 0, failed: 0, pending: 0 }
  )

  const statusStyle = STATUS_STYLES[campaign.status]
  const isDraft = campaign.status === 'draft'
  const canSend = isDraft && campaign.recipients_count > 0 && creditBalance >= campaign.recipients_count

  async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError(null)

    const text = await file.text()
    const lines = text.trim().split('\n')
    if (lines.length < 2) {
      setError(t('CSV must have a header row and at least one data row'))
      setUploading(false)
      return
    }

    const headers = lines[0].split(',').map((h) => h.trim().toLowerCase())
    const phoneIdx = headers.findIndex((h) => h === 'phone' || h === 'phone_number' || h === 'mobile')
    const nameIdx = headers.findIndex((h) => h === 'name' || h === 'full_name')

    if (phoneIdx === -1) {
      setError(t('CSV must have a "phone" column'))
      setUploading(false)
      return
    }

    const recipients = lines.slice(1)
      .map((line) => {
        const cols = line.split(',').map((c) => c.trim())
        const recipient: Record<string, string> = { phone: cols[phoneIdx] }
        headers.forEach((h, i) => {
          if (i !== phoneIdx && cols[i]) {
            recipient[h] = cols[i]
          }
        })
        if (nameIdx !== -1) recipient.name = cols[nameIdx]
        return recipient
      })
      .filter((r) => r.phone)

    if (recipients.length === 0) {
      setError(t('No valid recipients found in CSV'))
      setUploading(false)
      return
    }

    const res = await fetch(`/api/sms/campaigns/${campaign.id}/recipients`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipients }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? t('Something went wrong'))
    } else {
      router.refresh()
    }

    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSend() {
    if (!confirm(`${t('Sending...')} ${campaign.recipients_count} ${t('messages')}. ${t('Credits Reserved')}: ${campaign.recipients_count}`)) return
    setSending(true)
    setError(null)

    const res = await fetch(`/api/sms/campaigns/${campaign.id}/send`, { method: 'POST' })
    const data = await res.json()

    if (!res.ok) {
      setError(data.error ?? t('Something went wrong'))
      setSending(false)
      return
    }

    setSendResult(data)
    setSending(false)
    router.refresh()
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">{campaign.name}</h1>
          <p className="text-sm text-zinc-400 mt-1">
            {t('Created')} {new Date(campaign.created_at).toLocaleDateString('en-IL')}
            {campaign.sent_at && ` · ${t('Sent')} ${new Date(campaign.sent_at).toLocaleDateString('en-IL')}`}
          </p>
        </div>
        <span className={`text-sm font-medium px-3 py-1.5 rounded-full ${statusStyle.color}`}>
          {statusStyle.label}
        </span>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {[
          { label: t('Recipients'), value: campaign.recipients_count, color: 'text-zinc-900' },
          { label: t('Delivered'), value: deliveryStats.delivered, color: 'text-emerald-600' },
          { label: t('Sent'), value: deliveryStats.sent, color: 'text-blue-600' },
          { label: t('Failed'), value: deliveryStats.failed, color: 'text-red-600' },
          { label: t('Pending'), value: deliveryStats.pending, color: 'text-zinc-400' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white border border-zinc-200 rounded-xl p-4">
            <p className="text-xs text-zinc-400 font-medium uppercase tracking-wide">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Delivery progress bar */}
      {campaign.status !== 'draft' && campaign.recipients_count > 0 && (
        <div className="bg-white border border-zinc-200 rounded-xl p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-zinc-700">{t('Delivery Progress')}</span>
            <button
              onClick={() => router.refresh()}
              className="text-xs text-zinc-400 hover:text-zinc-600 transition-colors"
            >
              {t('Refresh')}
            </button>
          </div>
          <div className="h-3 bg-zinc-100 rounded-full overflow-hidden flex">
            {deliveryStats.delivered > 0 && (
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${(deliveryStats.delivered / campaign.recipients_count) * 100}%` }}
              />
            )}
            {deliveryStats.sent > 0 && (
              <div
                className="h-full bg-blue-400 transition-all"
                style={{ width: `${(deliveryStats.sent / campaign.recipients_count) * 100}%` }}
              />
            )}
            {deliveryStats.failed > 0 && (
              <div
                className="h-full bg-red-400 transition-all"
                style={{ width: `${(deliveryStats.failed / campaign.recipients_count) * 100}%` }}
              />
            )}
          </div>
          <div className="flex gap-4 mt-2 text-xs text-zinc-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> {t('Delivered')}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-400" /> {t('Sent')}</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> {t('Failed')}</span>
          </div>
        </div>
      )}

      {/* Template info */}
      {template && (
        <div className="bg-zinc-50 border border-zinc-200 rounded-xl p-4 mb-6">
          <p className="text-xs text-zinc-400 font-medium uppercase tracking-wide mb-1">{t('Message Template')}: {template.name}</p>
          <p className="text-sm text-zinc-700 font-mono whitespace-pre-wrap">{template.body_template}</p>
        </div>
      )}

      {/* Draft actions */}
      {isDraft && (
        <div className="bg-white border border-zinc-200 rounded-xl p-5 mb-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="font-semibold text-zinc-900">{t('Recipients')}</h3>
              <p className="text-sm text-zinc-400 mt-0.5">
                {t('Upload a CSV with at least a "phone" column. Add "name", "date", "address", "link" columns for template variables.')}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <label className="px-4 py-2 rounded-lg border border-zinc-200 text-sm font-medium text-zinc-600 hover:bg-zinc-50 cursor-pointer transition-colors">
                {uploading ? t('Uploading…') : t('+ Upload CSV')}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleCsvUpload}
                  disabled={uploading}
                />
              </label>
              <button
                onClick={handleSend}
                disabled={!canSend || sending}
                className="px-6 py-2 rounded-lg text-white text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: 'var(--brand, #6366f1)' }}
              >
                {sending ? t('Sending...') : `${t('Sent')} (${campaign.recipients_count} ${t('Credits')})`}
              </button>
            </div>
          </div>

          {creditBalance < campaign.recipients_count && campaign.recipients_count > 0 && (
            <div className="mt-3 bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-600">
                {t('Insufficient credits')}: {campaign.recipients_count} {t('Recipients')}, {creditBalance} {t('Credits')}.
              </p>
            </div>
          )}
        </div>
      )}

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {sendResult && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-6">
          <p className="text-sm text-emerald-700">
            {t('Campaign sent:')} {sendResult.sent} {t('delivered')}, {sendResult.failed} {t('failed')}.
          </p>
        </div>
      )}

      {/* Message list */}
      {messages.length > 0 && (
        <>
          <h2 className="text-lg font-semibold text-zinc-900 mb-4">{t('Messages')} ({messages.length})</h2>
          <div className="bg-white border border-zinc-200 rounded-xl overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-zinc-100">
                  <th className="text-left text-xs font-medium text-zinc-400 uppercase tracking-wide px-5 py-3">{t('Recipient')}</th>
                  <th className="text-left text-xs font-medium text-zinc-400 uppercase tracking-wide px-5 py-3">{t('Phone')}</th>
                  <th className="text-left text-xs font-medium text-zinc-400 uppercase tracking-wide px-5 py-3">{t('Status')}</th>
                  <th className="text-left text-xs font-medium text-zinc-400 uppercase tracking-wide px-5 py-3">{t('Sent')}</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((msg) => {
                  const s = MSG_STATUS[msg.status]
                  return (
                    <tr key={msg.id} className="border-b border-zinc-50 last:border-0 hover:bg-zinc-50 transition-colors">
                      <td className="px-5 py-3 text-sm text-zinc-700">{msg.recipient_name ?? '—'}</td>
                      <td className="px-5 py-3 text-sm text-zinc-600 font-mono">{msg.recipient_phone}</td>
                      <td className="px-5 py-3">
                        <span className={`text-xs font-medium ${s.color}`}>{s.label}</span>
                        {msg.error_message && (
                          <p className="text-[10px] text-red-400 mt-0.5">{msg.error_message}</p>
                        )}
                      </td>
                      <td className="px-5 py-3 text-sm text-zinc-400">
                        {msg.sent_at ? new Date(msg.sent_at).toLocaleTimeString('en-IL') : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
