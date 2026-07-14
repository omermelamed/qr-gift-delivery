// Validated 8-hue categorical palette (dataviz skill's reference instance —
// see references/palette.md). Fixed order: CVD-safety comes from the
// sequence itself, so slots are assigned by index and never reordered. A
// 9th+ category cycles back to slot 1 rather than generating a new hue.
export const CATEGORICAL_PALETTE = [
  '#2a78d6', // blue
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
  '#e87ba4', // magenta
  '#eb6834', // orange
]

export function colorForIndex(index: number): string {
  return CATEGORICAL_PALETTE[index % CATEGORICAL_PALETTE.length]
}
