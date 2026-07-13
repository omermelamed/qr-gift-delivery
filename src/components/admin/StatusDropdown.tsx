'use client'

import { useState, useRef, useEffect } from 'react'
import { useT } from '@/lib/i18n/useT'
import type { StatusFilter } from '@/lib/analytics/filterCampaigns'

const STATUS_DOT: Record<StatusFilter, string> = {
  all: 'bg-zinc-300',
  draft: 'bg-[var(--color-accent)]',
  active: 'bg-[var(--brand)]',
  closed: 'bg-[var(--color-secondary)]',
}

export function StatusDropdown({ value, onChange }: { value: StatusFilter; onChange: (v: StatusFilter) => void }) {
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

  const options: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: t('All statuses') },
    { value: 'draft', label: t('Draft') },
    { value: 'active', label: t('Active') },
    { value: 'closed', label: t('Closed') },
  ]

  const selected = options.find((o) => o.value === value)!

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="input-field h-9 flex items-center gap-2 px-3 text-sm hover:border-[var(--color-border-strong)] transition-colors whitespace-nowrap"
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[value]}`} />
        <span className="text-zinc-700">{selected.label}</span>
        <svg className={`w-4 h-4 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full mt-1.5 start-0 z-20 bg-white border border-zinc-200 rounded-xl shadow-lg py-1 min-w-[160px]">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-start hover:bg-zinc-100 transition-colors ${opt.value === value ? 'text-zinc-900 font-medium' : 'text-zinc-600'}`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[opt.value]}`} />
              {opt.label}
              {opt.value === value && (
                <svg className="w-3.5 h-3.5 text-brand ms-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
