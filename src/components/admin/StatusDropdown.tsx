'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '@/lib/i18n/useT'
import { useLocale } from '@/lib/i18n/LanguageContext'
import type { StatusFilter } from '@/lib/analytics/filterCampaigns'

const STATUS_DOT: Record<StatusFilter, string> = {
  all: 'bg-zinc-300',
  draft: 'bg-[var(--color-accent)]',
  active: 'bg-[var(--brand)]',
  closed: 'bg-[var(--color-secondary)]',
}

export function StatusDropdown({ value, onChange }: { value: StatusFilter; onChange: (v: StatusFilter) => void }) {
  const t = useT()
  const { locale } = useLocale()
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left?: number; right?: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  // Rendered in a portal (fixed-positioned), like KebabMenu, so the panel is
  // never clipped or painted behind a sibling card in the analytics grid.
  useEffect(() => {
    if (!open) return
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node
      if (btnRef.current?.contains(target) || menuRef.current?.contains(target)) return
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

  const options: { value: StatusFilter; label: string }[] = [
    { value: 'all', label: t('All statuses') },
    { value: 'draft', label: t('Draft') },
    { value: 'active', label: t('Active') },
    { value: 'closed', label: t('Closed') },
  ]

  const selected = options.find((o) => o.value === value)!

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        className="input-field h-9 flex items-center gap-2 px-3 text-sm hover:border-[var(--color-border-strong)] transition-colors whitespace-nowrap"
      >
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[value]}`} />
        <span className="text-zinc-700">{selected.label}</span>
        <svg className={`w-4 h-4 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && coords && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: coords.top, left: coords.left, right: coords.right }}
          className="z-50 bg-white border border-zinc-200 rounded-xl shadow-lg py-1 min-w-[160px]"
        >
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
        </div>,
        document.body,
      )}
    </>
  )
}
