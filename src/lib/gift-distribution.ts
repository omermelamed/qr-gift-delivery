import type { GiftOption } from '@/types'

export type GiftDistToken = { gift_id: string | null }
export type GiftDistRow = { id: string; name: string; count: number; pct: number }

export function giftDistribution(
  gifts: GiftOption[],
  tokens: GiftDistToken[]
): { rows: GiftDistRow[]; unchosen: number; total: number } {
  const total = tokens.length
  const counts = new Map<string, number>()
  let unchosen = 0
  for (const t of tokens) {
    if (t.gift_id) counts.set(t.gift_id, (counts.get(t.gift_id) ?? 0) + 1)
    else unchosen++
  }
  const rows = gifts.map((g) => {
    const count = counts.get(g.id) ?? 0
    return { id: g.id, name: g.name, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 }
  })
  return { rows, unchosen, total }
}
