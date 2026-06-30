'use client'

import { useEffect } from 'react'
import { useT } from '@/lib/i18n/useT'

// Error boundary for the admin surface. A thrown error in any admin page (e.g. a
// failed Supabase query) renders this instead of a blank/empty screen, so issues
// fail loudly and recoverably rather than masquerading as missing data.
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useT()

  useEffect(() => {
    console.error('[admin] page error:', error)
  }, [error])

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-2xl text-red-600">
          !
        </div>
        <h1 className="text-lg font-semibold text-zinc-900 mb-1">
          {t('Something went wrong')}
        </h1>
        <p className="text-sm text-zinc-500 mb-6">
          {t('This page failed to load. No data was lost — please try again.')}
        </p>
        <button
          onClick={reset}
          className="cursor-pointer rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-zinc-800"
        >
          {t('Try again')}
        </button>
        {error.digest && (
          <p className="mt-4 text-xs text-zinc-400">
            {t('Reference')}: {error.digest}
          </p>
        )}
      </div>
    </div>
  )
}
