'use client'

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="border border-zinc-200 rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover-brand transition-colors print:hidden"
    >
      Print all
    </button>
  )
}
