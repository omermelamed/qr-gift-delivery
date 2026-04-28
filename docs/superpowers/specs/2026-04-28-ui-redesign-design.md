# UI Redesign — Design Spec
Date: 2026-04-28

## Overview

Full visual redesign of QR Gift Delivery (working name: **GiftFlow**). The backend logic and API routes are unchanged. This spec covers every user-facing screen: login, admin shell, campaign list, new campaign form, campaign detail, and the distributor scanner.

---

## Visual System

### Palette
| Token | Value | Usage |
|---|---|---|
| `primary` | `#6366f1` (indigo) | Buttons, progress fill, active nav, focus rings |
| `primary-end` | `#8b5cf6` (violet) | Gradient endpoint (primary → violet) |
| `surface` | `#ffffff` | Cards, sidebar content area |
| `page-bg` | `#fafafa` | Page background |
| `border` | `#e4e4e7` | Card and input borders |
| `text` | `#18181b` | Primary text |
| `muted` | `#71717a` | Secondary / metadata text |
| `sidebar-bg` | `#18181b` | Dark sidebar background |
| `success` | `#16a34a` | Claimed / sent states |
| `warning` | `#d97706` | Draft / pending states |
| `error` | `#dc2626` | Invalid / already-claimed states |

### Typography
- Font: **Inter** (already loaded via `next/font/google`)
- No changes to font loading

### Buttons
- **Primary**: `bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg` with hover brightness lift
- **Secondary / outline**: `border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 rounded-lg`
- **Destructive**: `bg-red-600 text-white rounded-lg`

### Input fields
- `border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500`

---

## Admin Shell

Wraps all `/admin/*` routes via `src/app/admin/layout.tsx`.

### Sidebar
- **Collapsed state** (default): 56px wide, shows icons only
- **Expanded state**: 220px wide, shows icons + labels, triggered on `hover` of the sidebar element
- Transition: `width` with `transition-all duration-200`
- Background: `#18181b` (zinc-900)
- Items: Campaigns (`📋`), Sign out (bottom)
- Active item: `bg-indigo-600 text-white rounded-lg` highlight
- Inactive item: `text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg`
- Logo mark: indigo→violet gradient square (22×22px) + "GiftFlow" wordmark (hidden when collapsed)

### Page area
- `flex-1 overflow-auto bg-zinc-50`
- Page content gets `p-8 max-w-5xl` (or `max-w-7xl` for the campaign detail two-column layout)

---

## Login Page (`/login`)

- Full-page centered layout on `bg-zinc-50`
- Card: `bg-white rounded-2xl shadow-sm border border-zinc-200 p-8 w-full max-w-sm`
- Above the form: logo mark (gradient square) + "GiftFlow" wordmark, centered
- Fields: Email, Password with the standard input style above
- Submit button: full-width primary gradient
- Error state: red pill banner between logo and fields

---

## Campaign List (`/admin`)

- Page header: "Campaigns" h1 + "New Campaign" primary button (top-right)
- Empty state: centered illustration placeholder + "No campaigns yet. Create your first one." text + "New Campaign" button
- Campaign cards: `bg-white border border-zinc-200 rounded-xl p-5 hover:shadow-md transition-shadow`
  - Left: campaign name (semibold) + date (muted)
  - Right: status badge
    - Draft: `bg-violet-100 text-violet-700`
    - Sent: `bg-green-100 text-green-700`
- Cards link to `/admin/campaigns/[id]`

---

## New Campaign Form (`/admin/campaigns/new`)

- Centered, max-w-lg
- Back link: `← Campaigns` in muted text
- Form card: same white card style as login
- Fields: Campaign name (text), Campaign date (date picker)
- Submit: full-width primary gradient "Create Campaign"

---

## Campaign Detail (`/admin/campaigns/[id]`)

### Header
- Back link: `← Campaigns`
- Campaign name (h1) + date (muted)
- Status badge (Draft / Sent)
- **Launch button** (primary gradient, `🚀 Launch Campaign`) — visible only when `!sent_at && tokens.length > 0`
  - Clicking opens a **confirmation modal** (not `window.confirm()`): "Send QR codes to {n} employees via SMS?" with Cancel + Confirm buttons

### Layout
Two-column, side by side:

**Left rail (~300px, `flex-shrink-0`)**
- Stat cards row: Total / Claimed / Pending — small white cards with large number + label
- Redemption progress card: label + `{claimed} / {total}` + gradient progress bar + percentage
- CSV Uploader card (pre-launch only, hidden after `sent_at` is set):
  - Drag-and-drop zone: dashed indigo border, upload icon, "Drop CSV or click to browse"
  - Preview table (up to 10 rows) with valid/invalid status
  - "Confirm Upload ({n} employees)" primary button

**Right column (`flex-1`)**
- Employee table card
  - Header: "Employees ({n})" + "Resend to unclaimed ({n})" outline button + "Export CSV" outline button
  - Columns: Name, Phone (masked), Department, SMS, Claimed, Claimed At, Distributor
  - Redeemed rows: `bg-green-50`
  - Realtime updates: when a row's `redeemed` flips to true, the row background transitions to `bg-green-50` over 500ms (`transition-colors duration-500`)
  - Empty state: "No employees yet. Upload a CSV to get started."

---

## Scanner (`/scan`)

### Idle / scanning state
- Full-screen dark layout (`bg-black`)
- Camera feed fills the screen via `QrScanner` component
- Centered scan frame: four indigo corner brackets (no full border), 200×200px
- Animated scan line: horizontal indigo line sweeping top→bottom on loop
- Bottom hint: `"Point camera at QR code"` in `text-white/60 text-sm`

### Loading state (after scan, awaiting API)
- Semi-transparent black overlay (`bg-black/70`)
- Centered indigo spinner

### Success state
- Full-screen green overlay (`bg-green-600`)
- White circle with `✓` checkmark (64px)
- Employee name in `text-4xl font-bold text-white`
- Department + "Gift collected" in `text-white/80`
- `"Tap anywhere to scan next"` hint at bottom
- Tap anywhere dismisses and returns to scanning state

### Already-claimed state
- Full-screen red overlay (`bg-red-600`)
- White circle with `✗` (64px)
- `"Already claimed"` in `text-3xl font-bold text-white`
- Employee name in `text-white/80`
- `"Tap anywhere to scan next"` hint

### Invalid QR state
- Full-screen red overlay
- `"Could not verify"` + `"Try again"` subtext
- Tap to dismiss

**No auto-dismiss timer.** Distributor taps to advance. This replaces the current 3-second `setTimeout`.

---

## Out of Scope

- Employee-facing screens (employees only receive an SMS with a QR code image — no web view)
- Team management page (nav item exists but is future work)
- Settings page
- Dark mode
- Mobile-responsive admin (admin is desktop-first; scanner is mobile-only)
