'use client'

import { useState, useEffect, useCallback } from 'react'
import { useT } from '@/lib/i18n/useT'

type TokenRow = {
  id: string
  employee_name: string
  phone_number: string | null
  department: string | null
  token: string
  qr_image_url: string | null
  redeemed: boolean
}

// Mask all but the last 4 digits; tolerate a missing phone (it's optional).
function maskPhone(phone: string | null): string {
  if (!phone) return ''
  return phone.replace(/\d(?=\d{4})/g, '•')
}

export function QrGrid({ rows }: { rows: TokenRow[] }) {
  const t = useT()
  const [enlarged, setEnlarged] = useState<TokenRow | null>(null)

  const close = useCallback(() => setEnlarged(null), [])

  useEffect(() => {
    if (!enlarged) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enlarged, close])

  if (rows.length === 0) {
    return (
      <div className="text-center py-24 bg-white rounded-2xl border border-zinc-200">
        <p className="text-zinc-500">{t('No QR codes found for this campaign.')}</p>
      </div>
    )
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 print:grid-cols-3">
        {rows.map((row) => (
          <div
            key={row.id}
            onClick={() => row.qr_image_url && setEnlarged(row)}
            className={`bg-white border rounded-xl p-4 flex flex-col items-center gap-3 transition-shadow ${
              row.redeemed ? 'border-zinc-100 opacity-50' : 'border-zinc-200 shadow-sm'
            } ${row.qr_image_url ? 'cursor-zoom-in hover:shadow-md' : ''}`}
          >
            <p className="font-semibold text-zinc-900 text-sm text-center">{row.employee_name}</p>
            {row.department && (
              <p className="text-xs text-zinc-400 -mt-2">{row.department}</p>
            )}
            {row.qr_image_url ? (
              <img
                src={row.qr_image_url}
                alt={`QR for ${row.employee_name}`}
                width={160}
                height={160}
                className="rounded"
              />
            ) : (
              <div className="w-40 h-40 bg-zinc-100 rounded flex items-center justify-center text-xs text-zinc-400">
                {t('QR generating…')}
              </div>
            )}
            {row.phone_number && (
              <p className="text-xs text-zinc-400 font-mono break-all text-center">
                {maskPhone(row.phone_number)}
              </p>
            )}
            {row.redeemed && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500">
                {t('Redeemed')}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {enlarged && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
          onClick={close}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between w-full">
              <div>
                <p className="font-bold text-zinc-900 text-lg">{enlarged.employee_name}</p>
                {enlarged.department && (
                  <p className="text-sm text-zinc-400">{enlarged.department}</p>
                )}
              </div>
              <button
                onClick={close}
                className="text-zinc-400 hover-brand-text transition-colors p-1 rounded-lg hover-brand"
                aria-label={t('Close')}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <img
              src={enlarged.qr_image_url!}
              alt={`QR for ${enlarged.employee_name}`}
              width={320}
              height={320}
              className="rounded-xl"
            />

            {enlarged.phone_number && (
              <p className="text-sm text-zinc-400 font-mono">
                {maskPhone(enlarged.phone_number)}
              </p>
            )}

            {enlarged.redeemed && (
              <span className="text-sm font-semibold px-3 py-1 rounded-full bg-zinc-100 text-zinc-500">
                {t('Already redeemed')}
              </span>
            )}

            <p className="text-xs text-zinc-300">{t('Click outside or press Esc to close')}</p>
          </div>
        </div>
      )}
    </>
  )
}
