# Employee QR Direct Access — Design Spec

Date: 2026-05-09

## Summary

Add a QR icon button to each employee row in the campaign detail page's employee table. Clicking it opens an inline lightbox showing that employee's QR code. Only visible on sent campaigns (where `qr_image_url` is populated).

---

## Section 1: Data Layer

### TokenRow type change (`src/components/admin/EmployeeTable.tsx`)

Add two fields to the existing `TokenRow` type:
- `token: string`
- `qr_image_url: string | null`

### Server page change (`src/app/admin/campaigns/[id]/page.tsx`)

The existing `.select()` on `gift_tokens` must include `token` and `qr_image_url`:

```typescript
.select('id, employee_name, phone_number, department, sms_sent_at, redeemed, redeemed_at, redeemed_by, gift_id, token, qr_image_url')
```

No new API routes required.

---

## Section 2: UI

### QR column

- Added to the table as the **last column** (`<th>` and `<td>`)
- Only rendered when `!isDraft` (sent campaigns only)
- Column header: `"QR"` (short, matches existing column style)
- Each row cell contains a small QR icon button (SVG, ~16×16)
  - When `qr_image_url` is available: clickable, opens lightbox
  - When `qr_image_url` is `null` (still generating): icon rendered at reduced opacity, `disabled` / `cursor-not-allowed`
- Both grouped and flat table render paths get the column

### EmployeeQrModal component

New component rendered inside `EmployeeTable` (same file or co-located). State: `enlarged: TokenRow | null`.

Modal contents:
- Employee name (bold) + department (small text below)
- QR image at 320×320
- Masked phone number (`font-mono`)
- "Already redeemed" badge (shown only if `redeemed === true`)
- Close button (top-right ×)

Dismiss: click outside backdrop, press Esc, or click × button.

Pattern is identical to the existing `QrGrid` lightbox — no new interaction conventions introduced.

---

## Out of Scope

- Draft campaigns (no QR codes generated yet)
- Printing individual QR codes from this modal
- Showing the raw token URL in the modal
