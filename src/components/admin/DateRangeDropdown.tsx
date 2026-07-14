'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '@/lib/i18n/useT'
import { useLocale } from '@/lib/i18n/LanguageContext'
import { DatePicker } from '@/components/admin/DatePicker'

export function DateRangeDropdown({ from, to, onFromChange, onToChange }: {
  from: string; to: string; onFromChange: (v: string) => void; onToChange: (v: string) => void
}) {
  const t = useT()
  const { locale } = useLocale()
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left?: number; right?: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  // Rendered in a portal (fixed-positioned), like KebabMenu, so the panel is
  // never clipped or painted behind a sibling card in the analytics grid.
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (btnRef.current?.contains(target) || panelRef.current?.contains(target)) return
      setOpen(false)
    }
    function onMove() { setOpen(false) }
    document.addEventListener('mousedown', onDocClick)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open])

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setCoords(
        locale === 'he'
          ? { top: r.bottom + 6, right: window.innerWidth - r.right }
          : { top: r.bottom + 6, left: r.left },
      )
    }
    setOpen((v) => !v)
  }

  const hasFilter = from || to
  const label = hasFilter
    ? [from, to].filter(Boolean).join(' → ')
    : t('All dates')

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
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

      {open && coords && createPortal(
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, right: coords.right }}
          className="z-50 bg-white border border-zinc-200 rounded-xl shadow-lg p-3 w-80"
        >
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
        </div>,
        document.body,
      )}
    </>
  )
}
