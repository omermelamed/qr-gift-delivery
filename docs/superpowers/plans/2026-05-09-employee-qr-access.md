# Employee QR Direct Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a QR icon button to each employee row in the campaign detail table that opens an inline lightbox showing that employee's QR code.

**Architecture:** Two changes — (1) add `token` and `qr_image_url` to the server-side select and the `TokenRow` type so the data reaches `EmployeeTable`, (2) add a new QR column with an `EmployeeQrModal` lightbox component inline in `EmployeeTable`. Only visible on sent campaigns (`!isDraft`).

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4, Supabase.

---

## File Map

**Modify:**
- `src/app/admin/campaigns/[id]/page.tsx` — add `token, qr_image_url` to the `gift_tokens` `.select()` call (line 48)
- `src/components/admin/EmployeeTable.tsx` — add fields to `TokenRow` type; add `enlarged` state, Esc handler, `EmployeeQrModal` component, and QR column to both flat and grouped table render paths

---

## Task 1: Extend data layer

**Files:**
- Modify: `src/app/admin/campaigns/[id]/page.tsx`
- Modify: `src/components/admin/EmployeeTable.tsx`

- [ ] **Step 1: Add `token` and `qr_image_url` to the server select**

In `src/app/admin/campaigns/[id]/page.tsx`, find this line (around line 48):

```typescript
    .select('id, employee_name, phone_number, department, sms_sent_at, redeemed, redeemed_at, redeemed_by, gift_id')
```

Replace with:

```typescript
    .select('id, employee_name, phone_number, department, sms_sent_at, redeemed, redeemed_at, redeemed_by, gift_id, token, qr_image_url')
```

- [ ] **Step 2: Add fields to TokenRow type in EmployeeTable**

In `src/components/admin/EmployeeTable.tsx`, find the `TokenRow` type at the top of the file:

```typescript
type TokenRow = {
  id: string
  employee_name: string
  phone_number: string
  department: string | null
  sms_sent_at: string | null
  redeemed: boolean
  redeemed_at: string | null
  redeemed_by: string | null
  gift_id: string | null
}
```

Replace with:

```typescript
type TokenRow = {
  id: string
  employee_name: string
  phone_number: string
  department: string | null
  sms_sent_at: string | null
  redeemed: boolean
  redeemed_at: string | null
  redeemed_by: string | null
  gift_id: string | null
  token: string
  qr_image_url: string | null
}
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/campaigns/\[id\]/page.tsx src/components/admin/EmployeeTable.tsx
git commit -m "feat: add token and qr_image_url to gift_tokens select and TokenRow type"
```

---

## Task 2: Add QR column and EmployeeQrModal

**Files:**
- Modify: `src/components/admin/EmployeeTable.tsx`

This task adds three things to `EmployeeTable.tsx`:
1. An `EmployeeQrModal` component (defined before `EmployeeTable`)
2. State + Esc handler inside `EmployeeTable`
3. A QR column in both flat and grouped table render paths

- [ ] **Step 1: Add EmployeeQrModal before the EmployeeTable function**

In `src/components/admin/EmployeeTable.tsx`, add this component **before** the `export function EmployeeTable(...)` line:

```typescript
function EmployeeQrModal({
  target,
  onClose,
}: {
  target: TokenRow
  onClose: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl p-8 flex flex-col items-center gap-4 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between w-full">
          <div>
            <p className="font-bold text-zinc-900 text-lg">{target.employee_name}</p>
            {target.department && (
              <p className="text-sm text-zinc-400">{target.department}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-700 transition-colors p-1 rounded-lg hover:bg-zinc-100"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <img
          src={target.qr_image_url!}
          alt={`QR for ${target.employee_name}`}
          width={320}
          height={320}
          className="rounded-xl"
        />

        <p className="text-sm text-zinc-400 font-mono">
          {target.phone_number.replace(/\d(?=\d{4})/g, '•')}
        </p>

        {target.redeemed && (
          <span className="text-sm font-semibold px-3 py-1 rounded-full bg-zinc-100 text-zinc-500">
            Already redeemed
          </span>
        )}

        <p className="text-xs text-zinc-300">Click outside or press Esc to close</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Add enlarged state and closeQr callback inside EmployeeTable**

Inside `export function EmployeeTable(...)`, after the existing `const [showAddModal, setShowAddModal] = useState(false)` line, add:

```typescript
  const [enlarged, setEnlarged] = useState<TokenRow | null>(null)
  const closeQr = useCallback(() => setEnlarged(null), [])
```

`useCallback` is already imported from React. If not, add it to the existing React import.

- [ ] **Step 3: Add the QR column header to the table**

Find the `<thead>` block. It currently ends with:
```tsx
                <th className="px-3 py-2 font-medium">Distributor</th>
              </tr>
```

Add the QR header after `Distributor`, but only when `!isDraft`:

```tsx
                <th className="px-3 py-2 font-medium">Distributor</th>
                {!isDraft && <th className="px-3 py-2 font-medium w-8" />}
              </tr>
```

- [ ] **Step 4: Add QR cell to the flat (non-grouped) render path**

In the flat rows render (`rows.map((r) => (...))`), find the last `<td>` in each row — the Distributor cell:

```tsx
                      <td className="px-3 py-2.5 text-xs text-zinc-400">
                        {r.redeemed_by
                          ? distributorNames[r.redeemed_by] ?? r.redeemed_by
                          : <span className="text-zinc-300">—</span>}
                      </td>
```

After it, add the QR cell:

```tsx
                      {!isDraft && (
                        <td className="px-3 py-2.5">
                          <button
                            onClick={() => r.qr_image_url && setEnlarged(r)}
                            disabled={!r.qr_image_url}
                            className={`p-1 rounded transition-colors ${
                              r.qr_image_url
                                ? 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'
                                : 'text-zinc-200 cursor-not-allowed'
                            }`}
                            aria-label={r.qr_image_url ? `View QR for ${r.employee_name}` : 'QR generating'}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                            </svg>
                          </button>
                        </td>
                      )}
```

- [ ] **Step 5: Add QR cell to the grouped render path**

In the grouped rows render (`buildGroupedRows().map((row) => ...)`), the non-header rows have the same column structure. Find the Distributor `<td>` in that branch (it looks the same as in the flat path):

```tsx
                        <td className="px-3 py-2.5 text-xs text-zinc-400">
                          {row.redeemed_by
                            ? distributorNames[row.redeemed_by] ?? row.redeemed_by
                            : <span className="text-zinc-300">—</span>}
                        </td>
```

After it, add the same QR cell (using `row` instead of `r`):

```tsx
                        {!isDraft && (
                          <td className="px-3 py-2.5">
                            <button
                              onClick={() => row.qr_image_url && setEnlarged(row)}
                              disabled={!row.qr_image_url}
                              className={`p-1 rounded transition-colors ${
                                row.qr_image_url
                                  ? 'text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100'
                                  : 'text-zinc-200 cursor-not-allowed'
                              }`}
                              aria-label={row.qr_image_url ? `View QR for ${row.employee_name}` : 'QR generating'}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                              </svg>
                            </button>
                          </td>
                        )}
```

Also update the group header `<td colSpan>` to account for the extra column. Find:

```tsx
                        <td colSpan={showGiftCol ? 8 : 7} className="px-3 py-1.5 text-xs font-semibold text-zinc-500">
```

Replace with:

```tsx
                        <td colSpan={showGiftCol ? (isDraft ? 8 : 9) : (isDraft ? 7 : 8)} className="px-3 py-1.5 text-xs font-semibold text-zinc-500">
```

- [ ] **Step 6: Render EmployeeQrModal and update empty-state colSpan**

At the bottom of the `return (...)` block, inside the `<>` fragment (after `{showAddModal && <AddEmployeeModal .../>}`), add:

```tsx
      {enlarged && <EmployeeQrModal target={enlarged} onClose={closeQr} />}
```

Also update the empty-state `<td colSpan>` to match. Find:

```tsx
                  <td colSpan={showGiftCol ? 8 : 7} className="px-3 py-12 text-center text-zinc-400 text-sm">
```

Replace with:

```tsx
                  <td colSpan={showGiftCol ? (isDraft ? 8 : 9) : (isDraft ? 7 : 8)} className="px-3 py-12 text-center text-zinc-400 text-sm">
```

- [ ] **Step 7: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add src/components/admin/EmployeeTable.tsx
git commit -m "feat: add QR icon column and lightbox to employee table"
```

---

## Manual verification

After both tasks are committed:

1. Run `npm run dev`
2. Open a campaign that has been sent (has QR codes)
3. Navigate to the campaign detail page
4. The employee table should have a narrow unlabeled column on the right with a QR icon per row
5. Clicking the icon on a row with a `qr_image_url` opens a lightbox with the QR image, employee name, masked phone, and redeemed badge if applicable
6. Rows still generating (`qr_image_url = null`) show a faint disabled icon
7. Clicking outside the modal or pressing Esc closes it
8. On a draft campaign, the QR column should not appear at all
