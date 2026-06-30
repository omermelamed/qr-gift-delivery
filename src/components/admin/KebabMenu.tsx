'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '@/lib/i18n/useT'
import { useLocale } from '@/lib/i18n/LanguageContext'
import { DotsVerticalIcon } from '@/components/icons'

/**
 * Generic kebab (⋮) dropdown for secondary actions. The panel is rendered in a
 * portal (fixed-positioned) so it is never clipped by overflow containers like
 * tables, and it CLOSES on item click. Once opened, the panel stays mounted
 * (just hidden) so menu items that open their own modal keep that modal mounted
 * — provided those modals render in a portal (see ConfirmModal etc.), so they
 * remain visible even while the panel is hidden. Safe inside a clickable <Link>.
 */
export function KebabMenu({ children, label }: { children: React.ReactNode; label?: string }) {
  const t = useT()
  const { locale } = useLocale()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left?: number; right?: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

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

  function toggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      // Align the panel's edge to the button and open downward. RTL aligns to the
      // button's left edge (panel grows right); LTR aligns to the right edge.
      setCoords(
        locale === 'he'
          ? { top: r.bottom + 4, left: r.left }
          : { top: r.bottom + 4, right: window.innerWidth - r.right },
      )
      setMounted(true)
    }
    setOpen((o) => !o)
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-label={label ?? t('More actions')}
        aria-haspopup="menu"
        aria-expanded={open}
        className="h-[34px] w-[34px] inline-flex items-center justify-center rounded-lg text-zinc-500 hover-brand transition-colors"
      >
        <DotsVerticalIcon className="w-5 h-5" />
      </button>

      {mounted && coords && createPortal(
        <div
          ref={menuRef}
          role="menu"
          // Close on any item click. The panel stays mounted (display toggles) so
          // a clicked item's portal-rendered modal survives and stays visible.
          // stopPropagation is essential: React bubbles events through the portal's
          // *React* tree, so without it, clicks inside the menu (and its modals)
          // would reach an ancestor <Link> (campaign card) and navigate.
          onClick={(e) => { e.stopPropagation(); setOpen(false) }}
          style={{ position: 'fixed', top: coords.top, left: coords.left, right: coords.right, display: open ? 'flex' : 'none' }}
          className="z-50 min-w-44 bg-white border border-zinc-200 rounded-xl shadow-lg p-1 flex-col"
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  )
}
