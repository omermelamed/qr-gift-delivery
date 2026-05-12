# Batch Scan Mode — Design Spec

Date: 2026-05-12

## Summary

Add a batch scan mode to the distributor scan page. In batch mode the camera stays live continuously, scan results are appended to a persistent running list, and there is no full-screen result takeover between scans. Restricted to single-gift campaigns.

---

## Section 1: Scope & Architecture

### What changes

- `src/app/scan/page.tsx` — batch mode toggle, modified scan loop, persistent running list UI, debounce logic, summary modal
- No backend changes — every scan still hits the same atomic `POST /api/verify/:token` endpoint
- `src/components/QrScanner.tsx` — no changes needed

### State machine

Current flow:
```
scanning → loading → result (full-screen takeover) → scanning (tap to dismiss)
```

Batch mode flow:
```
scanning → loading → scanning (result appended to list; no takeover, no tap required)
```

### Multi-gift guard

The page has no upfront knowledge of which campaign a QR belongs to — the API resolves it. If a scan returns `needsGiftSelection: true` while in batch mode:
1. Exit batch mode
2. Show a brief toast: "Batch mode paused — gift selection required"
3. Fall into the normal `gift_selection` flow
4. The distributor can re-enter batch mode after completing the gift selection

### Token debounce

The zxing camera fires continuously on a held QR. Currently `scanState !== 'scanning'` prevents double-processing. In batch mode, since state returns to `scanning` immediately after each result, a token-level debounce is required: ignore the same token if it was last processed within 3 seconds.

Implementation: `lastScannedRef = useRef<{ token: string; time: number } | null>(null)`

---

## Section 2: UI Layout & Flow

### Entry point

A "Batch Mode" button sits in the bottom-left of the scan page during normal scanning (the existing "History" button stays bottom-right). Tapping toggles batch mode on. While in batch mode, the "History" button is hidden — the running list serves as the live history.

### Layout in batch mode

```
┌─────────────────────────────────┐
│                                 │
│      [Camera viewfinder]        │  ~45% height, stays live
│                                 │
├─────────────────────────────────┤
│  ● BATCH MODE    12 scanned     │  indigo status bar
├─────────────────────────────────┤
│  ✅ Dana Cohen          09:32   │
│  ✅ Yoni Levy           09:31   │
│  ⚠️  Moshe Ben-David    09:30   │  amber = already claimed
│  ✅ Sara Katz           09:29   │
│  ❌ Invalid QR          09:28   │  red = invalid / closed
│  ...                            │  scrollable, newest at top
├─────────────────────────────────┤
│       [ End Session ]           │  red-tinted button
└─────────────────────────────────┘
```

### During a scan

- Status bar pulses while `loading`
- Camera stays live — no overlay, no takeover
- On result: new row slides in at the top of the list
- Audio feedback: soft high chime for ✅, low tone for ⚠️/❌ (Web Audio API, no library)

### Row anatomy

`[icon] [Employee name] [spacer] [HH:MM] [status badge]`

| Icon | Color  | Meaning          |
|------|--------|------------------|
| ✅   | green  | Claimed          |
| ⚠️   | amber  | Already claimed  |
| ❌   | red    | Invalid / closed |

### End session

Tapping "End Session" shows a summary modal:

```
Session complete
─────────────────
✅ Claimed          18
⚠️  Already claimed   2
❌ Invalid            1
─────────────────
Total scanned       21

        [ Done ]
```

"Done" clears `scanHistory`, sets `isBatchMode` to false, and dismisses the modal. Returns to the normal single-scan view.

---

## Section 3: Components & State

### New state in `ScanPage`

```typescript
const [isBatchMode, setIsBatchMode] = useState(false)
const [showBatchSummary, setShowBatchSummary] = useState(false)
const lastScannedRef = useRef<{ token: string; time: number } | null>(null)
```

The existing `scanHistory: ScanHistoryEntry[]` (previously capped at 10) becomes the batch list when in batch mode — uncapped, and always visible rather than hidden behind the History button.

### Changes to `handleScan`

In batch mode, after receiving the API response:
1. Check debounce — return early if same token within 3 seconds
2. Append entry to `scanHistory` (no cap)
3. Play audio feedback
4. Set `scanState` back to `'scanning'` immediately
5. If `needsGiftSelection: true` — exit batch mode, show toast, enter `gift_selection` flow

### New components (co-located in `scan/page.tsx`)

**`BatchScanList`**
- Props: `entries: ScanHistoryEntry[]`
- Renders scrollable `<ul>`, newest entry at top
- Each row: icon + name + time + status badge

**`BatchSummaryModal`**
- Props: `entries: ScanHistoryEntry[]`, `onDone: () => void`
- Derives counts (claimed / already_claimed / invalid) from entries
- "Done" calls `onDone`

### Audio feedback

Two inline functions using `AudioContext` — no library:

```typescript
function playSuccess() {
  const ctx = new AudioContext()
  const osc = ctx.createOscillator()
  osc.connect(ctx.destination)
  osc.frequency.value = 880
  osc.start()
  osc.stop(ctx.currentTime + 0.12)
}

function playError() {
  const ctx = new AudioContext()
  const osc = ctx.createOscillator()
  osc.connect(ctx.destination)
  osc.frequency.value = 220
  osc.start()
  osc.stop(ctx.currentTime + 0.2)
}
```

---

## Out of Scope

- Multi-gift campaigns in batch mode (deferred — exit to normal flow if encountered)
- Offline/cached scan mode
- Exporting the batch session list
- GPS location tagging of redemptions
