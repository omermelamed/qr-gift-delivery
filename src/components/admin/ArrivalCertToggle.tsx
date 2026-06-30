'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/useT'

export function ArrivalCertToggle({
  campaignId,
  initial,
  initialMax,
}: {
  campaignId: string
  initial: boolean
  initialMax: number | null
}) {
  const t = useT()
  const router = useRouter()
  const [enabled, setEnabled] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [maxValue, setMaxValue] = useState<string>(initialMax != null ? String(initialMax) : '')

  async function patch(payload: object, onError: () => void) {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) onError()
      else router.refresh()
    } catch {
      onError()
    }
  }

  async function toggle() {
    if (busy) return
    const next = !enabled
    setBusy(true)
    setEnabled(next)
    await patch({ supportsArrivalCertificates: next }, () => setEnabled(!next))
    setBusy(false)
  }

  async function saveMax() {
    // Empty = no limit (null). Otherwise an integer >= 1; bad input reverts.
    const trimmed = maxValue.trim()
    let payloadMax: number | null
    if (trimmed === '') {
      payloadMax = null
    } else {
      const n = Number(trimmed)
      if (!Number.isInteger(n) || n < 1) {
        setMaxValue(initialMax != null ? String(initialMax) : '')
        return
      }
      payloadMax = n
    }
    setBusy(true)
    await patch({ maxAttendeeCount: payloadMax }, () => {
      setMaxValue(initialMax != null ? String(initialMax) : '')
    })
    setBusy(false)
  }

  return (
    <div className="flex flex-col gap-3 bg-white rounded-2xl border border-zinc-200 shadow-sm p-4">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={toggle}
          className="mt-0.5 w-4 h-4 accent-indigo-500"
        />
        <span>
          <span className="block text-sm font-medium text-zinc-900">{t('Supports Arrival Certificates')}</span>
          <span className="block text-xs text-zinc-500">{t('Let people confirm attendance and how many are coming.')}</span>
        </span>
      </label>

      {enabled && (
        <div className="flex flex-col gap-1.5 ps-7">
          <label htmlFor="max-attendees" className="text-sm font-medium text-zinc-700">
            {t('Max people per invite (including the employee)')}
          </label>
          <input
            id="max-attendees"
            type="number"
            min={1}
            step={1}
            value={maxValue}
            disabled={busy}
            placeholder={t('No limit')}
            onChange={(e) => setMaxValue(e.target.value)}
            onBlur={saveMax}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            className="w-32 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-brand"
          />
          <span className="text-xs text-zinc-500">{t('e.g. 5 = the person plus up to 4 guests.')}</span>
        </div>
      )}
    </div>
  )
}
