'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/useT'

export function ArrivalCertToggle({ campaignId, initial }: { campaignId: string; initial: boolean }) {
  const t = useT()
  const router = useRouter()
  const [enabled, setEnabled] = useState(initial)
  const [busy, setBusy] = useState(false)

  async function toggle() {
    if (busy) return
    const next = !enabled
    setBusy(true)
    setEnabled(next)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supportsArrivalCertificates: next }),
      })
      if (!res.ok) setEnabled(!next)
      else router.refresh()
    } catch {
      setEnabled(!next)
    } finally {
      setBusy(false)
    }
  }

  return (
    <label className="flex items-start gap-3 bg-white rounded-2xl border border-zinc-200 shadow-sm p-4 cursor-pointer">
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
  )
}
