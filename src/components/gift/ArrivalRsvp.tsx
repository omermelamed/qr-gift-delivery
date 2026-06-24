'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/useT'

type Props = {
  token: string
  initialAttending: boolean | null
  initialCount: number | null
  maxCount: number | null
  onSubmitted?: () => void
}

export function ArrivalRsvp({ token, initialAttending, initialCount, maxCount, onSubmitted }: Props) {
  const router = useRouter()
  const t = useT()
  const [attending, setAttending] = useState<boolean | null>(initialAttending)
  const [count, setCount] = useState<string>(initialCount ? String(initialCount) : '1')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (busy || attending === null) return
    let attendeeCount: number | undefined
    if (attending) {
      const n = Number(count)
      if (!Number.isInteger(n) || n < 1) {
        setError(t('Please enter how many people are coming (1 or more).'))
        return
      }
      attendeeCount = n
      if (maxCount !== null && n > maxCount) {
        setError(t('You can bring up to {n} people.').replace('{n}', String(maxCount)))
        return
      }
    }
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/gift/${token}/rsvp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attending, attendeeCount }),
      })
      const data = await res.json()
      if (!data.ok) {
        if (data.error === 'over_limit') {
          setError(t('You can bring up to {n} people.').replace('{n}', String(data.max)))
        } else {
          setError(t('Could not save your response. Please try again.'))
        }
        setBusy(false)
        return
      }
      onSubmitted?.()
      router.refresh()
    } catch {
      setError(t('Could not save your response. Please try again.'))
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-zinc-500">{t('Are you coming?')}</p>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => setAttending(true)}
          className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-colors ${attending === true ? 'bg-indigo-500 text-white border-indigo-500' : 'border-zinc-200 text-zinc-700'}`}
        >
          {t("I'm coming")}
        </button>
        <button
          type="button"
          onClick={() => setAttending(false)}
          className={`flex-1 py-3 rounded-xl text-sm font-semibold border transition-colors ${attending === false ? 'bg-zinc-700 text-white border-zinc-700' : 'border-zinc-200 text-zinc-700'}`}
        >
          {t("I'm not coming")}
        </button>
      </div>

      {attending === true && (
        <div className="flex flex-col gap-1.5 text-start">
          <label htmlFor="attendee-count" className="text-sm font-medium text-zinc-700">
            {t('How many people are coming? (including you)')}
          </label>
          <input
            id="attendee-count"
            type="number"
            min={1}
            max={maxCount ?? undefined}
            step={1}
            value={count}
            onChange={(e) => setCount(e.target.value)}
            className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {maxCount !== null && (
            <span className="text-xs text-zinc-500">
              {t('Up to {n} people').replace('{n}', String(maxCount))}
            </span>
          )}
        </div>
      )}

      {attending !== null && (
        <button
          type="button"
          disabled={busy}
          onClick={submit}
          className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
        >
          {busy ? t('Saving…') : t('Save response')}
        </button>
      )}

      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  )
}
