'use client'

import { useState, useRef, useEffect } from 'react'
import { useT } from '@/lib/i18n/useT'
import { DatePicker } from '@/components/admin/DatePicker'

export function DateRangeDropdown({ from, to, onFromChange, onToChange }: {
  from: string; to: string; onFromChange: (v: string) => void; onToChange: (v: string) => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [open])

  const hasFilter = from || to
  const label = hasFilter
    ? [from, to].filter(Boolean).join(' → ')
    : t('All dates')

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`input-field h-9 flex items-center gap-2 px-3 text-sm hover:border-[var(--color-border-strong)] transition-colors whitespace-nowrap ${hasFilter ? 'border-brand text-brand' : 'text-zinc-700'}`}
      >
        <svg className="w-3.5 h-3.5 flex-shrink-0 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span>{label}</span>
        {hasFilter && (
          <span
            role="button"
            onClick={(e) => { e.stopPropagation(); onFromChange(''); onToChange('') }}
            className="flex items-center text-brand/60 hover:text-brand transition-colors"
            title={t('Clear dates')}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </span>
        )}
        <svg className={`w-4 h-4 opacity-50 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1.5 start-0 z-20 bg-white border border-zinc-200 rounded-xl shadow-lg p-3 w-80">
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-500">{t('From date')}</label>
              <DatePicker value={from} max={to || undefined} onChange={onFromChange} />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-zinc-500">{t('To date')}</label>
              <DatePicker value={to} min={from || undefined} onChange={onToChange} />
            </div>
            {hasFilter && (
              <button
                type="button"
                onClick={() => { onFromChange(''); onToChange('') }}
                className="text-xs text-zinc-400 hover:text-zinc-600 text-start pt-1 transition-colors"
              >
                {t('Clear dates')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
