import { describe, it, expect } from 'vitest'
import { giftDistribution } from '@/lib/gift-distribution'

const gifts = [
  { id: 'g-1', name: 'Headphones', position: 0 },
  { id: 'g-2', name: 'Mug', position: 1 },
]

describe('giftDistribution', () => {
  it('counts chosen gifts regardless of redemption', () => {
    const tokens = [
      { gift_id: 'g-1' },
      { gift_id: 'g-1' },
      { gift_id: 'g-2' },
      { gift_id: null },
    ]
    const { rows, unchosen, total } = giftDistribution(gifts, tokens)
    expect(total).toBe(4)
    expect(unchosen).toBe(1)
    expect(rows.find((r) => r.id === 'g-1')!.count).toBe(2)
    expect(rows.find((r) => r.id === 'g-2')!.count).toBe(1)
    expect(rows.find((r) => r.id === 'g-1')!.pct).toBe(50)
  })

  it('handles an empty token list', () => {
    const { rows, unchosen, total } = giftDistribution(gifts, [])
    expect(total).toBe(0)
    expect(unchosen).toBe(0)
    expect(rows.every((r) => r.count === 0 && r.pct === 0)).toBe(true)
  })
})
