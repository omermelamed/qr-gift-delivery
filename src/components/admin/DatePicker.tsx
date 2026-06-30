'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocale } from '@/lib/i18n/LanguageContext'
import { useT } from '@/lib/i18n/useT'
import { toISODate, parseISODate, monthMatrix, formatDisplay } from '@/lib/date-picker'

type Props = {
  value: string
  onChange: (value: string) => void
  id?: string
  placeholder?: string
}

const inputClass =
  'w-full text-start border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-brand focus:border-transparent'

export function DatePicker({ value, onChange, id, placeholder }: Props) {
  const { locale } = useLocale()
  const t = useT()
  const intlLocale = locale === 'he' ? 'he-IL' : 'en-GB'
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  const selected = parseISODate(value)
  const today = new Date()
  const [view, setView] = useState(() => ({
    year: selected?.year ?? today.getFullYear(),
    month: selected?.month ?? today.getMonth() + 1, // 1-12
  }))

  // Toggle open; when opening, jump the view to the selected month (or today).
  function toggleOpen() {
    if (!open) {
      const s = parseISODate(value)
      setView({
        year: s?.year ?? today.getFullYear(),
        month: s?.month ?? today.getMonth() + 1,
      })
    }
    setOpen((o) => !o)
  }

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const weeks = useMemo(() => monthMatrix(view.year, view.month), [view])

  const weekdayLabels = useMemo(() => {
    // Sunday-start labels (2023-01-01 was a Sunday).
    const fmt = new Intl.DateTimeFormat(intlLocale, { weekday: 'short' })
    return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2023, 0, 1 + i)))
  }, [intlLocale])

  const monthTitle = new Date(view.year, view.month - 1, 1).toLocaleDateString(intlLocale, {
    month: 'long',
    year: 'numeric',
  })

  function shiftMonth(delta: number) {
    setView((v) => {
      const m0 = v.month - 1 + delta // 0-based
      const year = v.year + Math.floor(m0 / 12)
      const month = ((m0 % 12) + 12) % 12 + 1
      return { year, month }
    })
  }

  function pick(day: number) {
    onChange(toISODate(view.year, view.month, day))
    setOpen(false)
  }

  const display = formatDisplay(value, locale)

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        id={id}
        onClick={toggleOpen}
        className={`${inputClass} flex items-center justify-between gap-2`}
      >
        <span className={display ? 'text-zinc-900' : 'text-zinc-400'}>
          {display || (placeholder ?? t('Select date'))}
        </span>
        <svg className="w-4 h-4 text-zinc-400 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
          <path fillRule="evenodd" d="M6 2a1 1 0 0 1 1 1v1h6V3a1 1 0 1 1 2 0v1h1a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h1V3a1 1 0 0 1 1-1Zm10 6H4v8h12V8Z" clipRule="evenodd" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 top-full start-0 w-72 bg-white rounded-xl border border-zinc-200 shadow-lg p-3">
          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label={t('Previous month')}
              className="w-8 h-8 rounded-lg hover-brand text-zinc-600 flex items-center justify-center"
            >
              ‹
            </button>
            <span className="text-sm font-semibold text-zinc-900">{monthTitle}</span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label={t('Next month')}
              className="w-8 h-8 rounded-lg hover-brand text-zinc-600 flex items-center justify-center"
            >
              ›
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {weekdayLabels.map((w, i) => (
              <div key={i} className="text-center text-[11px] font-medium text-zinc-400 py-1">{w}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {weeks.flat().map((day, i) => {
              if (day === null) return <div key={i} />
              const iso = toISODate(view.year, view.month, day)
              const isSelected = iso === value
              const isToday =
                view.year === today.getFullYear() &&
                view.month === today.getMonth() + 1 &&
                day === today.getDate()
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => pick(day)}
                  className={`h-9 rounded-lg text-sm transition-colors ${
                    isSelected
                      ? 'bg-brand text-white font-semibold'
                      : isToday
                        ? 'text-brand font-semibold hover-brand'
                        : 'text-zinc-700 hover-brand'
                  }`}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
