# Batch Scan Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a batch scan mode to the distributor scan page where the camera stays live continuously, each scan result is appended to a persistent running list, and a session summary is shown when the distributor ends the session. Restricted to single-gift campaigns via a reactive guard.

**Architecture:** All changes are confined to `src/app/scan/page.tsx` and two supporting files. `ScanOutcome` and `ScanHistoryEntry` are promoted to `src/types/index.ts` so they can be unit-tested via `src/lib/batch-scan.ts`. Two new components (`BatchScanList`, `BatchSummaryModal`) are co-located in `scan/page.tsx`. No backend changes.

**Tech Stack:** React 19, Next.js App Router, Vitest, Web Audio API, Tailwind CSS

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `src/types/index.ts` | Add `ScanOutcome` and `ScanHistoryEntry` types |
| Create | `src/lib/batch-scan.ts` | Pure utilities: debounce check, summary counts, audio feedback |
| Create | `tests/lib/batch-scan.test.ts` | Unit tests for batch scan utilities |
| Modify | `src/app/scan/page.tsx` | Batch mode state, scan loop, new components, batch UI |

---

## Task 1: Promote shared scan types

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/app/scan/page.tsx`

- [ ] **Step 1: Add types to `src/types/index.ts`**

Append at the end of the file:

```typescript
export type ScanOutcome = 'success' | 'already_claimed' | 'invalid' | 'closed' | 'not_authorized'

export type ScanHistoryEntry = {
  employeeName: string | null
  outcome: ScanOutcome
  timestamp: Date
}
```

- [ ] **Step 2: Update the import in `src/app/scan/page.tsx`**

Replace:
```typescript
import type { TokenVerifyResult, GiftOption } from '@/types'
```
With:
```typescript
import type { TokenVerifyResult, GiftOption, ScanOutcome, ScanHistoryEntry } from '@/types'
```

- [ ] **Step 3: Remove the local type declarations in `src/app/scan/page.tsx`**

Delete these three lines (keep `ScanState` — it is local-only):
```typescript
type ScanOutcome = 'success' | 'already_claimed' | 'invalid' | 'closed' | 'not_authorized'

type ScanHistoryEntry = {
  employeeName: string | null
  outcome: ScanOutcome
  timestamp: Date
}
```

- [ ] **Step 4: Run tests**

```bash
npm run test
```
Expected: All tests pass — no logic changed.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/app/scan/page.tsx
git commit -m "refactor: promote ScanOutcome and ScanHistoryEntry to shared types"
```

---

## Task 2: Batch scan utilities + tests (TDD)

**Files:**
- Create: `tests/lib/batch-scan.test.ts`
- Create: `src/lib/batch-scan.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/batch-scan.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { isBatchDuplicate, getBatchSummary } from '@/lib/batch-scan'
import type { ScanHistoryEntry } from '@/types'

describe('isBatchDuplicate', () => {
  it('returns false when lastScanned is null', () => {
    expect(isBatchDuplicate(null, 'token-abc', Date.now())).toBe(false)
  })

  it('returns false when token differs', () => {
    const last = { token: 'token-abc', time: Date.now() - 1000 }
    expect(isBatchDuplicate(last, 'token-xyz', Date.now())).toBe(false)
  })

  it('returns true when same token within 3 seconds', () => {
    const now = Date.now()
    const last = { token: 'token-abc', time: now - 1500 }
    expect(isBatchDuplicate(last, 'token-abc', now)).toBe(true)
  })

  it('returns false when same token older than 3 seconds', () => {
    const now = Date.now()
    const last = { token: 'token-abc', time: now - 3001 }
    expect(isBatchDuplicate(last, 'token-abc', now)).toBe(false)
  })

  it('returns false exactly at the 3 second boundary', () => {
    const now = Date.now()
    const last = { token: 'token-abc', time: now - 3000 }
    expect(isBatchDuplicate(last, 'token-abc', now)).toBe(false)
  })
})

describe('getBatchSummary', () => {
  it('returns all zeros for empty entries', () => {
    expect(getBatchSummary([])).toEqual({ claimed: 0, alreadyClaimed: 0, invalid: 0, total: 0 })
  })

  it('counts claimed entries correctly', () => {
    const entries: ScanHistoryEntry[] = [
      { employeeName: 'Dana', outcome: 'success', timestamp: new Date() },
      { employeeName: 'Yoni', outcome: 'success', timestamp: new Date() },
    ]
    expect(getBatchSummary(entries).claimed).toBe(2)
  })

  it('counts already_claimed entries correctly', () => {
    const entries: ScanHistoryEntry[] = [
      { employeeName: 'Moshe', outcome: 'already_claimed', timestamp: new Date() },
    ]
    const summary = getBatchSummary(entries)
    expect(summary.alreadyClaimed).toBe(1)
    expect(summary.claimed).toBe(0)
    expect(summary.invalid).toBe(0)
  })

  it('counts invalid, closed, and not_authorized all as invalid', () => {
    const entries: ScanHistoryEntry[] = [
      { employeeName: null, outcome: 'invalid', timestamp: new Date() },
      { employeeName: null, outcome: 'closed', timestamp: new Date() },
      { employeeName: null, outcome: 'not_authorized', timestamp: new Date() },
    ]
    expect(getBatchSummary(entries).invalid).toBe(3)
  })

  it('returns correct total across all outcomes', () => {
    const entries: ScanHistoryEntry[] = [
      { employeeName: 'A', outcome: 'success', timestamp: new Date() },
      { employeeName: 'B', outcome: 'already_claimed', timestamp: new Date() },
      { employeeName: null, outcome: 'invalid', timestamp: new Date() },
    ]
    expect(getBatchSummary(entries).total).toBe(3)
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test -- tests/lib/batch-scan.test.ts
```
Expected: `Cannot find module '@/lib/batch-scan'`

- [ ] **Step 3: Create `src/lib/batch-scan.ts`**

```typescript
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
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test -- tests/lib/batch-scan.test.ts
```
Expected: 9 tests pass.

- [ ] **Step 5: Run full test suite**

```bash
npm run test
```
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/batch-scan.ts tests/lib/batch-scan.test.ts
git commit -m "feat: add batch scan utility functions and audio feedback with tests"
```

---

## Task 3: Add batch mode state and modify `handleScan`

**Files:**
- Modify: `src/app/scan/page.tsx`

- [ ] **Step 1: Add the new import line**

Replace:
```typescript
import { useState, useCallback, useEffect } from 'react'
```
With:
```typescript
import { useState, useCallback, useEffect, useRef } from 'react'
import { isBatchDuplicate, playSuccess, playError } from '@/lib/batch-scan'
```

- [ ] **Step 2: Add new state inside `ScanPage`, after the existing `useState` declarations**

```typescript
const [isBatchMode, setIsBatchMode] = useState(false)
const [showBatchSummary, setShowBatchSummary] = useState(false)
const [batchToast, setBatchToast] = useState<string | null>(null)
const lastScannedRef = useRef<{ token: string; time: number } | null>(null)
```

- [ ] **Step 3: Replace `handleScan` entirely**

```typescript
const handleScan = useCallback(
  async (text: string) => {
    if (scanState !== 'scanning') return
    setScanState('loading')

    const match = text.match(TOKEN_PATTERN)
    if (!match) {
      const entry: ScanHistoryEntry = { employeeName: null, outcome: 'invalid', timestamp: new Date() }
      if (isBatchMode) {
        if (isBatchDuplicate(lastScannedRef.current, 'invalid', Date.now())) {
          setScanState('scanning')
          return
        }
        setScanHistory((prev) => [entry, ...prev])
        playError()
        setScanState('scanning')
      } else {
        setResult({ valid: false, reason: 'invalid' })
        setScanHistory((prev) => [entry, ...prev].slice(0, 10))
        setScanState('result')
      }
      return
    }

    const token = match[1]

    if (isBatchMode && isBatchDuplicate(lastScannedRef.current, token, Date.now())) {
      setScanState('scanning')
      return
    }

    let r: TokenVerifyResult = { valid: false, reason: 'invalid' }
    try {
      const res = await fetch(`/api/verify/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ distributorId: userId }),
      })
      r = await res.json()
    } catch {
      r = { valid: false, reason: 'invalid' }
    }

    // Multi-gift guard: exit batch mode and hand off to gift selection flow
    if (r.valid && r.needsGiftSelection) {
      if (isBatchMode) {
        setIsBatchMode(false)
        setBatchToast('Batch mode paused — gift selection required')
        setTimeout(() => setBatchToast(null), 3000)
      }
      setPendingToken(token)
      setPendingEmployee(r.employeeName)
      setGiftOptions(r.gifts)
      setScanState('gift_selection')
      return
    }

    const employeeName = r.valid
      ? r.employeeName
      : r.reason === 'already_used'
      ? r.employeeName
      : null
    const outcome = outcomeFromResult(r)
    const entry: ScanHistoryEntry = { employeeName, outcome, timestamp: new Date() }

    if (isBatchMode) {
      lastScannedRef.current = { token, time: Date.now() }
      setScanHistory((prev) => [entry, ...prev])
      outcome === 'success' ? playSuccess() : playError()
      setScanState('scanning')
    } else {
      setResult(r)
      setScanHistory((prev) => [entry, ...prev].slice(0, 10))
      setScanState('result')
    }
  },
  [scanState, userId, isBatchMode]
)
```

- [ ] **Step 4: Run tests**

```bash
npm run test
```
Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/app/scan/page.tsx
git commit -m "feat: add batch mode state and modify handleScan for batch flow"
```

---

## Task 4: `BatchScanList` component

**Files:**
- Modify: `src/app/scan/page.tsx` (add above the `ScanPage` function)

- [ ] **Step 1: Add `BatchScanList` above the `ScanPage` function definition**

```typescript
function BatchScanList({ entries, t }: { entries: ScanHistoryEntry[]; t: (key: string) => string }) {
  return (
    <ul className="flex flex-col divide-y divide-zinc-800 overflow-y-auto flex-1">
      {entries.length === 0 && (
        <li className="flex items-center justify-center py-10 text-zinc-500 text-sm">
          {t('Ready to scan')}
        </li>
      )}
      {entries.map((entry, i) => (
        <li
          key={`${entry.timestamp.getTime()}-${i}`}
          className="flex items-center gap-3 px-4 py-3"
        >
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              entry.outcome === 'success'
                ? 'bg-green-500/20'
                : entry.outcome === 'already_claimed'
                ? 'bg-amber-500/20'
                : 'bg-red-500/20'
            }`}
          >
            {entry.outcome === 'success' ? (
              <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            ) : entry.outcome === 'already_claimed' ? (
              <svg className="w-4 h-4 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {entry.employeeName ??
                (entry.outcome === 'invalid' ? t('Invalid QR code') :
                 entry.outcome === 'closed' ? t('Campaign closed') :
                 entry.outcome === 'not_authorized' ? t('Not authorised') : t('Unknown'))}
            </p>
            <p className="text-xs text-zinc-400">
              {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </p>
          </div>
          <span
            className={`text-xs font-medium flex-shrink-0 ${
              entry.outcome === 'success'
                ? 'text-green-400'
                : entry.outcome === 'already_claimed'
                ? 'text-amber-400'
                : 'text-red-400'
            }`}
          >
            {entry.outcome === 'success'
              ? t('Claimed')
              : entry.outcome === 'already_claimed'
              ? t('Already claimed')
              : entry.outcome === 'closed'
              ? t('Closed')
              : entry.outcome === 'not_authorized'
              ? t('Not auth.')
              : t('Invalid')}
          </span>
        </li>
      ))}
    </ul>
  )
}
```

Note: `t` is passed as a prop (not via `useT()`) because `BatchScanList` is a plain function component that may be rendered inside `ScanPage` where `t` is already available. This avoids a redundant hook call.

- [ ] **Step 2: Run tests**

```bash
npm run test
```
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/app/scan/page.tsx
git commit -m "feat: add BatchScanList component"
```

---

## Task 5: `BatchSummaryModal` component

**Files:**
- Modify: `src/app/scan/page.tsx` (add below `BatchScanList`, above `ScanPage`)

- [ ] **Step 1: Add `BatchSummaryModal`**

```typescript
function BatchSummaryModal({
  entries,
  onDone,
  t,
}: {
  entries: ScanHistoryEntry[]
  onDone: () => void
  t: (key: string) => string
}) {
  const summary = getBatchSummary(entries)
  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/80 px-6">
      <div className="bg-zinc-900 rounded-2xl p-6 w-full max-w-sm">
        <h2 className="text-white text-xl font-bold text-center mb-6">{t('Session complete')}</h2>
        <div className="flex flex-col gap-3 mb-6">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-green-400 text-sm font-medium">
              <span>✅</span>{t('Claimed')}
            </span>
            <span className="text-white font-bold text-lg">{summary.claimed}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-amber-400 text-sm font-medium">
              <span>⚠️</span>{t('Already claimed')}
            </span>
            <span className="text-white font-bold text-lg">{summary.alreadyClaimed}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-red-400 text-sm font-medium">
              <span>❌</span>{t('Invalid')}
            </span>
            <span className="text-white font-bold text-lg">{summary.invalid}</span>
          </div>
          <div className="h-px bg-zinc-700 my-1" />
          <div className="flex items-center justify-between">
            <span className="text-zinc-400 text-sm">{t('Total scanned')}</span>
            <span className="text-white font-bold text-lg">{summary.total}</span>
          </div>
        </div>
        <button
          onClick={onDone}
          className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-colors"
        >
          {t('Done')}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add the `getBatchSummary` import to `scan/page.tsx`**

Update the batch-scan import line (added in Task 3) to include `getBatchSummary`:

Replace:
```typescript
import { isBatchDuplicate, playSuccess, playError } from '@/lib/batch-scan'
```
With:
```typescript
import { isBatchDuplicate, getBatchSummary, playSuccess, playError } from '@/lib/batch-scan'
```

- [ ] **Step 3: Run tests**

```bash
npm run test
```
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/scan/page.tsx
git commit -m "feat: add BatchSummaryModal component"
```

---

## Task 6: Wire up the batch mode UI

**Files:**
- Modify: `src/app/scan/page.tsx` (update the JSX `return` in `ScanPage`)

- [ ] **Step 1: Add `handleEndSession` and `handleDoneSummary` inside `ScanPage`, after `handleCancelGift`**

```typescript
function handleEndSession() {
  setShowBatchSummary(true)
}

function handleDoneSummary() {
  setScanHistory([])
  lastScannedRef.current = null
  setIsBatchMode(false)
  setShowBatchSummary(false)
}
```

- [ ] **Step 2: Replace the entire `return (...)` block in `ScanPage`**

```tsx
return (
  <main className="flex flex-col bg-black overflow-hidden" style={{ height: '100dvh' }}>
    <div className="relative flex-1 overflow-hidden">

      {/* Camera — full screen in single mode, top 45% in batch mode */}
      <div className={isBatchMode ? 'absolute inset-x-0 top-0 h-[45%]' : 'absolute inset-0'}>
        <QrScanner onResult={handleScan} active={scanState === 'scanning' && userId !== null} />
      </div>

      {/* ── BATCH MODE ── */}
      {isBatchMode && (
        <div className="absolute inset-x-0 bottom-0 top-[45%] flex flex-col bg-zinc-950">
          {/* Status bar */}
          <div className="flex items-center justify-between px-4 py-2 bg-indigo-900/60 border-b border-indigo-700/40">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
              <span className="text-indigo-300 text-xs font-semibold uppercase tracking-widest">
                {t('Batch Mode')}
              </span>
            </div>
            <span className="text-zinc-400 text-xs">
              {scanHistory.length} {t('scanned')}
            </span>
          </div>

          {/* Loading spinner between scans */}
          {scanState === 'loading' && (
            <div className="flex justify-center py-2">
              <div className="w-5 h-5 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Running list */}
          <BatchScanList entries={scanHistory} t={t} />

          {/* End session */}
          <div className="px-4 py-3 border-t border-zinc-800">
            <button
              onClick={handleEndSession}
              className="w-full py-3 bg-red-900/40 hover:bg-red-800/50 border border-red-700/40 text-red-400 font-semibold rounded-xl transition-colors text-sm"
            >
              {t('End Session')}
            </button>
          </div>
        </div>
      )}

      {/* ── SINGLE SCAN MODE ── */}
      {!isBatchMode && (
        <>
          {/* Scan frame */}
          {scanState === 'scanning' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <div className="relative w-52 h-52">
                <span className="absolute top-0 left-0 w-8 h-8 border-t-2 border-l-2 border-indigo-400 rounded-tl-lg" />
                <span className="absolute top-0 right-0 w-8 h-8 border-t-2 border-r-2 border-indigo-400 rounded-tr-lg" />
                <span className="absolute bottom-0 left-0 w-8 h-8 border-b-2 border-l-2 border-indigo-400 rounded-bl-lg" />
                <span className="absolute bottom-0 right-0 w-8 h-8 border-b-2 border-r-2 border-indigo-400 rounded-br-lg" />
                <span className="absolute left-2 right-2 h-0.5 bg-gradient-to-r from-transparent via-indigo-400 to-transparent animate-scan-line" style={{ top: '50%' }} />
              </div>
              <p className="text-white/50 text-sm mt-6">{t('Point camera at QR code')}</p>
            </div>
          )}

          {/* Loading overlay */}
          {scanState === 'loading' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/70">
              <div className="w-10 h-10 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Gift selection */}
          {scanState === 'gift_selection' && (
            <div className="absolute inset-0 flex flex-col bg-zinc-900 px-6 pt-12 pb-8">
              <p className="text-white/60 text-sm text-center mb-1">{t('Scanning for')}</p>
              <p className="text-white text-2xl font-bold text-center mb-8">{pendingEmployee}</p>
              <p className="text-white/80 text-sm font-medium text-center mb-4">{t('Which gift did they take?')}</p>
              <div className="flex flex-col gap-3 flex-1">
                {giftOptions.map((gift, i) => (
                  <button
                    key={gift.id}
                    onClick={() => handleGiftSelect(gift.id)}
                    disabled={giftLoading}
                    className="w-full py-5 rounded-2xl text-white text-lg font-semibold disabled:opacity-50 active:scale-95 transition-transform"
                    style={{ backgroundColor: GIFT_COLORS[i % GIFT_COLORS.length] }}
                  >
                    {gift.name}
                  </button>
                ))}
              </div>
              <button
                onClick={handleCancelGift}
                disabled={giftLoading}
                className="mt-6 text-white/40 text-sm text-center w-full"
              >
                {t('Cancel scan')}
              </button>
            </div>
          )}

          {/* Result takeover */}
          {scanState === 'result' && result && (
            <div
              onClick={handleDismiss}
              className={`absolute inset-0 flex flex-col items-center justify-center gap-5 cursor-pointer select-none ${
                result.valid ? 'bg-green-600' : 'bg-red-600'
              }`}
            >
              <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-lg">
                <span className="text-4xl">{result.valid ? '✓' : '✗'}</span>
              </div>
              {result.valid ? (
                <>
                  <p className="text-white text-4xl font-bold text-center px-8">{result.employeeName}</p>
                  <p className="text-white/80 text-lg">{t('Gift collected')}</p>
                </>
              ) : result.reason === 'campaign_closed' ? (
                <>
                  <p className="text-white text-3xl font-bold">{t('Campaign closed')}</p>
                  <p className="text-white/80 text-lg">{t('No further gifts can be claimed')}</p>
                </>
              ) : result.reason === 'not_authorized' ? (
                <>
                  <p className="text-white text-3xl font-bold">{t('Not authorised')}</p>
                  <p className="text-white/80 text-lg">{t('You are not assigned to this campaign')}</p>
                </>
              ) : result.reason === 'already_used' ? (
                <>
                  <p className="text-white text-3xl font-bold">{t('Already claimed')}</p>
                  {result.employeeName && (
                    <p className="text-white/80 text-lg">{result.employeeName}</p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-white text-3xl font-bold">{t('Could not verify')}</p>
                  <p className="text-white/80 text-lg">{t('Try again')}</p>
                </>
              )}
              <p className="text-white/40 text-sm absolute bottom-10">{t('Tap anywhere to scan next')}</p>
            </div>
          )}

          {/* Back to admin + Batch Mode button + History */}
          {scanState !== 'result' && scanState !== 'gift_selection' && (
            <>
              <a
                href="/admin"
                className="absolute top-5 start-5 bg-zinc-800/80 text-white text-sm font-medium px-4 py-2 rounded-full backdrop-blur-sm"
              >
                {t('← Admin')}
              </a>
              <button
                onClick={() => setIsBatchMode(true)}
                className="absolute bottom-8 start-6 bg-zinc-800/80 text-white text-sm font-medium px-4 py-2 rounded-full backdrop-blur-sm"
              >
                {t('Batch Mode')}
              </button>
              <button
                onClick={() => setShowHistory(true)}
                className="absolute bottom-8 end-6 bg-zinc-800/80 text-white text-sm font-medium px-4 py-2 rounded-full backdrop-blur-sm"
              >
                {t('History')} {scanHistory.length > 0 && `(${scanHistory.length})`}
              </button>
            </>
          )}

          {/* History bottom sheet */}
          {showHistory && (
            <div
              className="absolute inset-0 flex flex-col justify-end z-30"
              onClick={() => setShowHistory(false)}
            >
              <div
                className="bg-zinc-900/95 rounded-t-2xl p-5 max-h-[60vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-white font-semibold">{t('Recent scans')}</h2>
                  <button onClick={() => setShowHistory(false)} className="text-zinc-400 hover:text-white transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {scanHistory.length === 0 ? (
                  <p className="text-zinc-400 text-sm text-center py-6">{t('No scans yet this session')}</p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {scanHistory.map((entry, i) => (
                      <li key={`${entry.timestamp.getTime()}-${i}`} className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          entry.outcome === 'success' ? 'bg-green-500/20' : 'bg-red-500/20'
                        }`}>
                          {entry.outcome === 'success' ? (
                            <svg className="w-4 h-4 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">
                            {entry.employeeName ??
                              (entry.outcome === 'invalid' ? t('Invalid QR code') :
                               entry.outcome === 'not_authorized' ? t('Not auth.') :
                               entry.outcome === 'closed' ? t('Campaign closed') : 'Unknown')}
                          </p>
                          <p className="text-xs text-zinc-400">
                            {entry.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <span className={`text-xs font-medium flex-shrink-0 ${
                          entry.outcome === 'success' ? 'text-green-400' :
                          entry.outcome === 'already_claimed' ? 'text-amber-400' : 'text-red-400'
                        }`}>
                          {entry.outcome === 'success' ? t('Claimed') :
                           entry.outcome === 'already_claimed' ? t('Already claimed') :
                           entry.outcome === 'closed' ? t('Closed') :
                           entry.outcome === 'not_authorized' ? t('Not auth.') : t('Invalid')}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Batch toast — shown briefly when exiting batch mode due to multi-gift */}
      {batchToast && (
        <div className="absolute top-6 inset-x-4 z-50 flex justify-center pointer-events-none">
          <div className="bg-zinc-800 text-white text-sm font-medium px-4 py-2 rounded-full shadow-lg">
            {batchToast}
          </div>
        </div>
      )}

      {/* Batch summary modal */}
      {showBatchSummary && (
        <BatchSummaryModal entries={scanHistory} onDone={handleDoneSummary} t={t} />
      )}

    </div>
  </main>
)
```

- [ ] **Step 3: Run tests**

```bash
npm run test
```
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/app/scan/page.tsx
git commit -m "feat: wire up batch mode UI — toggle, running list, end session, summary modal"
```

---

## Task 7: Manual test checklist

Start the dev server:
```bash
npm run dev
```
Navigate to `/scan` as a distributor user.

**Normal mode — confirm nothing regressed:**
- [ ] Scan a valid QR → full-screen green takeover with employee name → tap anywhere to dismiss → camera reactivates
- [ ] Scan an already-redeemed QR → full-screen red takeover → tap to dismiss
- [ ] "History" button (bottom-right) opens bottom sheet with past scans
- [ ] "← Admin" link (top-left) works

**Entering batch mode:**
- [ ] "Batch Mode" button is visible bottom-left in scanning state
- [ ] Tapping it switches layout: camera fills top 45%, status bar shows "BATCH MODE / 0 scanned", empty list with "Ready to scan", "End Session" button at bottom
- [ ] "Batch Mode" and "History" buttons are gone in batch mode

**Batch scanning:**
- [ ] Scan a valid QR → green row appears at top of list, success chime plays, camera immediately ready
- [ ] Scan an already-redeemed QR → amber ⚠️ row appears, error tone plays
- [ ] Scan an invalid/unrecognised image → red ❌ row appears
- [ ] Hold the same QR code without moving for 5+ seconds → only one row is added (debounce prevents duplicates)
- [ ] Scan 3 different QRs in quick succession → 3 rows appear newest-first, count in status bar increments correctly
- [ ] Spinner appears briefly between scans during `loading` state

**End session:**
- [ ] Tap "End Session" → summary modal appears with correct counts for claimed / already claimed / invalid / total
- [ ] Tap "Done" → list clears, returns to normal single-scan mode, "Batch Mode" button reappears

**Multi-gift guard (requires a campaign with multiple gift options):**
- [ ] In batch mode, scan a QR from a multi-gift campaign → batch mode exits, toast "Batch mode paused — gift selection required" appears and auto-dismisses after 3 seconds, gift picker shows normally
