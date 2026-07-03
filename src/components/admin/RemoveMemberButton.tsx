'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/useT'

type Props = { userId: string; name: string; className?: string }

export function RemoveMemberButton({ userId, name, className }: Props) {
  const t = useT()
  const [showModal, setShowModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function handleRemove(keepEmployee: boolean) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/team/members/${userId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keepEmployee }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? t('Failed to remove member'))
        setShowModal(false)
        return
      }
      router.refresh()
      setShowModal(false)
    } catch {
      setError(t('Network error — please try again'))
      setShowModal(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {error && <span className="text-xs text-red-500 me-1">{error}</span>}
      {className ? (
        <button onClick={() => { setError(null); setShowModal(true) }} className={className}>
          {t('Delete')}
        </button>
      ) : (
        <button
          onClick={() => { setError(null); setShowModal(true) }}
          aria-label={`Remove ${name}`}
          className="text-zinc-300 hover:text-red-500 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      )}

      {showModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
            <h2 className="text-base font-semibold text-zinc-900 mb-1">{t('Delete')} {name} {t('from team?')}</h2>
            <p className="text-sm text-zinc-500 mb-5">
              {name} {t('will immediately lose access to GiftFlow. Choose what happens to their employee record.')}
            </p>

            <div className="flex flex-col gap-2">
              <button
                onClick={() => handleRemove(true)}
                disabled={loading}
                className="w-full text-start px-4 py-3 rounded-xl border border-zinc-200 hover:border-zinc-300 hover-brand transition-colors disabled:opacity-50"
              >
                <p className="text-sm font-medium text-zinc-800">{t('Remove from team only')}</p>
                <p className="text-xs text-zinc-400 mt-0.5">{t('Keep in employee directory (phone, department stay intact)')}</p>
              </button>
              <button
                onClick={() => handleRemove(false)}
                disabled={loading}
                className="w-full text-start px-4 py-3 rounded-xl border border-red-100 hover:border-red-200 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                <p className="text-sm font-medium text-red-600">{t('Remove completely')}</p>
                <p className="text-xs text-zinc-400 mt-0.5">{t('Remove from team and delete from employee directory')}</p>
              </button>
            </div>

            <button
              onClick={() => setShowModal(false)}
              disabled={loading}
              className="mt-4 w-full text-center text-sm font-medium text-zinc-600 hover-brand-text transition-colors disabled:opacity-50"
            >
              {t('Cancel')}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
