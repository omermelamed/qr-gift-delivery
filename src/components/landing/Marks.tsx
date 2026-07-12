import type { ReactNode } from 'react'

// The QR finder pattern — the square-in-square corner mark of every QR code —
// is the landing page's signature glyph.
export function QrMark({ className = '' }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block h-3 w-3 shrink-0 border-2 border-current p-[2px] ${className}`}
    >
      <span className="block h-full w-full bg-current" />
    </span>
  )
}

// Small inline "play" triangle — used on both the nav and hero CTAs that
// open the how-it-works video modal, so the two buttons read as one action.
export function PlayIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={`h-3 w-3 shrink-0 ${className}`}>
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

export function Eyebrow({
  children,
  className = 'text-brand',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <p className={`flex items-center gap-2 text-sm font-semibold uppercase tracking-widest ${className}`}>
      <QrMark />
      {children}
    </p>
  )
}
