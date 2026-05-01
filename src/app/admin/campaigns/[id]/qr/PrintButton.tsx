'use client'

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="border border-zinc-200 rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors print:hidden"
    >
      Print all
    </button>
  )
}
