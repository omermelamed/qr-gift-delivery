'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/useT'

export function RsvpLockToggle({
  campaignId,
  initial,
}: {
  campaignId: string
  initial: boolean
}) {
  const t = useT()
  const router = useRouter()
  const [locked, setLocked] = useState(initial)
  const [busy, setBusy] = useState(false)

  async function toggle() {
    if (busy) return
    const next = !locked
    setBusy(true)
    setLocked(next)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/rsvp-lock`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rsvpLocked: next }),
      })
      if (!res.ok) setLocked(!next)
      else router.refresh()
    } catch {
      setLocked(!next)
    }
    setBusy(false)
  }

  return (
    <div className="flex items-start gap-3 bg-white rounded-2xl border border-zinc-200 p-4">
      <button
        type="button"
        role="switch"
        aria-checked={locked}
        disabled={busy}
        onClick={toggle}
        className={`relative mt-0.5 h-[22px] w-[38px] flex-shrink-0 rounded-full transition-colors disabled:opacity-50 ${locked ? 'bg-brand' : 'bg-zinc-300'}`}
      >
        <span
          className={`absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-[inset-inline-start] duration-150 ${
            locked ? 'start-[18px]' : 'start-0.5'
          }`}
        />
      </button>
      <span>
        <span className="block text-sm font-medium text-zinc-900">
          {t('Stop new RSVPs (event is full)')}
        </span>
        <span className="block text-xs text-zinc-500">
          {t("People who already said they're coming keep their spot. Everyone else sees an \"event is full\" message instead of the RSVP form.")}
        </span>
      </span>
    </div>
  )
}
