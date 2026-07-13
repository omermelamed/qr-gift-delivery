'use client'

export type LegendItem = { key: string; label: string; color: string }

// Clicking a swatch+label removes that group's bar(s) from the chart above
// (not just fades it) — the hidden set is owned by the caller so it can
// decide what "removed" means for its own data shape.
export function ToggleLegend({ items, hidden, onToggle }: {
  items: LegendItem[]
  hidden: Set<string>
  onToggle: (key: string) => void
}) {
  return (
    <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
      {items.map((item) => {
        const isHidden = hidden.has(item.key)
        return (
          <button
            key={item.key}
            type="button"
            onClick={() => onToggle(item.key)}
            aria-pressed={!isHidden}
            className={`flex items-center gap-1.5 text-xs transition-opacity ${isHidden ? 'opacity-40' : ''}`}
          >
            <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
            <span className={isHidden ? 'text-zinc-400 line-through' : 'text-zinc-600'}>{item.label}</span>
          </button>
        )
      })}
    </div>
  )
}
