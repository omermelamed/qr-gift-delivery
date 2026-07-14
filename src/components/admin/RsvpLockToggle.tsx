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
    <div className="flex flex-col gap-3 bg-white rounded-2xl border border-zinc-200 p-4">
      <label className="flex items-start gap-3 cursor-pointer">
        <input
          type="checkbox"
          checked={locked}
          disabled={busy}
          onChange={toggle}
          className="mt-0.5 w-4 h-4 accent-[var(--brand)]"
        />
        <span>
          <span className="block text-sm font-medium text-zinc-900">
            {t('Stop new RSVPs (event is full)')}
          </span>
          <span className="block text-xs text-zinc-500">
            {t("People who already said they're coming keep their spot. Everyone else sees an \"event is full\" message instead of the RSVP form.")}
          </span>
        </span>
      </label>
    </div>
  )
}
