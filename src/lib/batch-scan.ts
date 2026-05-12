import type { ScanHistoryEntry } from '@/types'

export function isBatchDuplicate(
  lastScanned: { token: string; time: number } | null,
  token: string,
  now: number
): boolean {
  return lastScanned !== null && lastScanned.token === token && now - lastScanned.time < 3000
}

export type BatchSummary = {
  claimed: number
  alreadyClaimed: number
  invalid: number
  total: number
}

export function getBatchSummary(entries: ScanHistoryEntry[]): BatchSummary {
  return {
    claimed: entries.filter((e) => e.outcome === 'success').length,
    alreadyClaimed: entries.filter((e) => e.outcome === 'already_claimed').length,
    invalid: entries.filter((e) => e.outcome !== 'success' && e.outcome !== 'already_claimed').length,
    total: entries.length,
  }
}

export function playSuccess(): void {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    osc.connect(ctx.destination)
    osc.frequency.value = 880
    osc.start()
    osc.stop(ctx.currentTime + 0.12)
  } catch {
    // AudioContext unavailable (SSR or restricted browser)
  }
}

export function playError(): void {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    osc.connect(ctx.destination)
    osc.frequency.value = 220
    osc.start()
    osc.stop(ctx.currentTime + 0.2)
  } catch {
    // AudioContext unavailable
  }
}
