'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n/useT'

export function ResendInviteButton({ userId }: { userId: string }) {
  const t = useT()
  const [state, setState] = useState<'idle' | 'loading' | 'sent' | 'error'>('idle')

  async function handleResend() {
    setState('loading')
    try {
      const res = await fetch('/api/team/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (res.ok) {
        setState('sent')
        setTimeout(() => setState('idle'), 3000)
      } else {
        setState('error')
        setTimeout(() => setState('idle'), 3000)
      }
    } catch {
      setState('error')
      setTimeout(() => setState('idle'), 3000)
    }
  }

  return (
    <button
      onClick={handleResend}
      disabled={state === 'loading' || state === 'sent'}
      className="border border-zinc-200 rounded-lg px-3 py-1 text-xs font-medium text-zinc-600 hover-brand disabled:opacity-50 transition-colors"
    >
      {state === 'loading' ? t('Sending…') : state === 'sent' ? t('Sent!') : state === 'error' ? t('Failed') : t('Resend')}
    </button>
  )
}
