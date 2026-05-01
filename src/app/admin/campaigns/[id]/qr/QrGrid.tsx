'use client'

import { useState, useEffect, useCallback } from 'react'

type TokenRow = {
  id: string
  employee_name: string
  phone_number: string
  department: string | null
  token: string
  qr_image_url: string | null
  redeemed: boolean
}

export function QrGrid({ rows }: { rows: TokenRow[] }) {
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

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 print:grid-cols-3">
        {rows.map((t) => (
          <div
            key={t.id}
            onClick={() => t.qr_image_url && setEnlarged(t)}
            className={`bg-white border rounded-xl p-4 flex flex-col items-center gap-3 transition-shadow ${
              t.redeemed ? 'border-zinc-100 opacity-50' : 'border-zinc-200 shadow-sm'
            } ${t.qr_image_url ? 'cursor-zoom-in hover:shadow-md' : ''}`}
          >
            <p className="font-semibold text-zinc-900 text-sm text-center">{t.employee_name}</p>
            {t.department && (
              <p className="text-xs text-zinc-400 -mt-2">{t.department}</p>
            )}
            {t.qr_image_url ? (
              <img
                src={t.qr_image_url}
                alt={`QR for ${t.employee_name}`}
                width={160}
                height={160}
                className="rounded"
              />
            ) : (
              <div className="w-40 h-40 bg-zinc-100 rounded flex items-center justify-center text-xs text-zinc-400">
                QR generating…
              </div>
            )}
            <p className="text-xs text-zinc-400 font-mono break-all text-center">
              {t.phone_number.replace(/\d(?=\d{4})/g, '•')}
            </p>
            {t.redeemed && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-500">
                Redeemed
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
                className="text-zinc-400 hover:text-zinc-700 transition-colors p-1 rounded-lg hover:bg-zinc-100"
                aria-label="Close"
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

            <p className="text-sm text-zinc-400 font-mono">
              {enlarged.phone_number.replace(/\d(?=\d{4})/g, '•')}
            </p>

            {enlarged.redeemed && (
              <span className="text-sm font-semibold px-3 py-1 rounded-full bg-zinc-100 text-zinc-500">
                Already redeemed
              </span>
            )}

            <p className="text-xs text-zinc-300">Click outside or press Esc to close</p>
          </div>
        </div>
      )}
    </>
  )
}
