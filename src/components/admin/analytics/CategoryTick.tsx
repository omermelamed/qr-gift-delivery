'use client'

type Props = {
  x?: number
  y?: number
  payload?: { value: string }
  maxChars: number
}

// Custom Y-axis tick for category labels (campaign/department names).
// Recharts' default tick otherwise wraps long labels onto a second line,
// which reads as ragged and misaligns bars against their labels once names
// vary in length. This keeps every label on one line, truncating with an
// ellipsis past `maxChars` — the full name is still available via the
// native <title> tooltip on hover.
export function CategoryTick({ x = 0, y = 0, payload, maxChars }: Props) {
  const label = payload?.value ?? ''
  const truncated = label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label
  return (
    // direction="ltr": campaign/department names are always Latin-script
    // user data regardless of locale. Without it, the SVG text inherits
    // dir="rtl" from the page in Hebrew mode and the browser's bidi
    // algorithm visually reorders the truncation ellipsis to the wrong
    // side ("…Cam" instead of "Cam…").
    <text x={x} y={y} dy={4} textAnchor="end" fontSize={12} fill="#2E312F" direction="ltr">
      <title>{label}</title>
      {truncated}
    </text>
  )
}
