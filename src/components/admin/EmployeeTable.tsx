'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'
import { AddEmployeeModal } from '@/components/admin/AddEmployeeModal'
import { useT } from '@/lib/i18n/useT'

type TokenRow = {
  id: string
  employee_name: string
  phone_number: string | null
  department: string | null
  sms_sent_at: string | null
  redeemed: boolean
  redeemed_at: string | null
  redeemed_by: string | null
  gift_id: string | null
  token: string
  qr_image_url: string | null
  attending: boolean | null
  attendee_count: number | null
  arrived_count: number | null
}

function maskPhone(phone: string): string {
  return phone.replace(/\d(?=\d{4})/g, '•')
}

function EmployeeQrModal({
  target,
  onClose,
}: {
  target: TokenRow & { qr_image_url: string }
  onClose: () => void
}) {
  const t = useT()
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
            className="text-zinc-400 hover-brand-text transition-colors p-1 rounded-lg hover-brand"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <img
          src={target.qr_image_url}
          alt={`QR for ${target.employee_name}`}
          width={320}
          height={320}
          className="rounded-xl"
        />

        {target.phone_number && (
          <p className="text-sm text-zinc-400 font-mono">
            <span dir="ltr">{maskPhone(target.phone_number)}</span>
          </p>
        )}

        {target.redeemed && (
          <span className="text-sm font-semibold px-3 py-1 rounded-full bg-zinc-100 text-zinc-500">
            {t('Already redeemed')}
          </span>
        )}

        <p className="text-xs text-zinc-300">{t('Click outside or press Esc to close')}</p>
      </div>
    </div>
  )
}

function GiftCell({
  giftId,
  gifts,
  giftMap,
  editable,
  onChange,
}: {
  giftId: string | null
  gifts: { id: string; name: string }[]
  giftMap: Map<string, { name: string; color: string }>
  editable: boolean
  onChange: (giftId: string) => void
}) {
  if (editable) {
    return (
      <select
        value={giftId ?? ''}
        onChange={(e) => onChange(e.target.value)}
        className="text-xs border border-zinc-200 rounded-md px-1.5 py-1 bg-white max-w-[10rem]"
      >
        <option value="">—</option>
        {gifts.map((g) => (
          <option key={g.id} value={g.id}>{g.name}</option>
        ))}
      </select>
    )
  }
  if (giftId && giftMap.get(giftId)) {
    return (
      <span
        className="inline-block px-2 py-0.5 rounded-full text-xs font-medium text-white"
        style={{ backgroundColor: giftMap.get(giftId)!.color }}
      >
        {giftMap.get(giftId)!.name}
      </span>
    )
  }
  return <span className="text-zinc-300">—</span>
}

function AttendeeCountCell({
  attending,
  attendeeCount,
  editable,
  onChange,
}: {
  attending: boolean | null
  attendeeCount: number | null
  editable: boolean
  onChange: (value: number | null) => void
}) {
  const serverValue = attending === true && attendeeCount != null ? attendeeCount : null

  if (!editable) {
    return serverValue != null
      ? <span className="text-zinc-700">{serverValue}</span>
      : <span className="text-zinc-300">—</span>
  }

  function commit(el: HTMLInputElement) {
    const str = el.value.trim()
    if (str === '') {
      if (serverValue != null) onChange(null)
      return
    }
    const n = Number(str)
    if (!Number.isInteger(n) || n < 1) {
      el.value = serverValue != null ? String(serverValue) : ''
      return
    }
    if (n !== serverValue) onChange(n)
  }

  // Uncontrolled input keyed on the server value: when the row updates
  // (Realtime / refresh) the key changes and React remounts with the fresh
  // defaultValue — no setState-in-effect sync needed.
  return (
    <input
      key={serverValue ?? 'empty'}
      type="number"
      min={1}
      defaultValue={serverValue ?? ''}
      placeholder="—"
      onBlur={(e) => commit(e.currentTarget)}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
      className="w-16 text-xs border border-zinc-200 rounded-md px-1.5 py-1 bg-white"
    />
  )
}

const PAGE_SIZE = 20

export function EmployeeTable({
  campaignId,
  initialRows,
  isDraft,
  gifts = [],
  canEditGift = false,
  showAttendance = false,
  canEditAttendance = false,
}: {
  campaignId: string
  initialRows: TokenRow[]
  isDraft: boolean
  gifts?: { id: string; name: string }[]
  canEditGift?: boolean
  showAttendance?: boolean
  canEditAttendance?: boolean
}) {
  const t = useT()
  const router = useRouter()
  const [rows, setRows] = useState(initialRows)
  // Sync rows when the server re-renders via router.refresh() (e.g. after populate)
  useEffect(() => { setRows(initialRows) }, [initialRows])
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [showAddModal, setShowAddModal] = useState(false)
  const [enlarged, setEnlarged] = useState<(TokenRow & { qr_image_url: string }) | null>(null)
  const closeQr = useCallback(() => setEnlarged(null), [])

  const GIFT_COLORS = ['#6366f1', '#8b5cf6', '#f59e0b', '#14b8a6', '#f43f5e', '#f97316']
  const giftMap = new Map(gifts.map((g, i) => [g.id, { name: g.name, color: GIFT_COLORS[i % GIFT_COLORS.length] }]))

  async function changeGift(tokenId: string, giftId: string) {
    await fetch(`/api/campaigns/${campaignId}/tokens/${tokenId}/gift`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ giftId: giftId || null }),
    })
    // Realtime UPDATE subscription already refreshes the table rows.
  }

  async function changeAttendance(tokenId: string, value: number | null) {
    await fetch(`/api/campaigns/${campaignId}/tokens/${tokenId}/attendance`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attendeeCount: value }),
    })
    // Realtime UPDATE refreshes the row; refresh re-computes the ArrivalSummary totals.
    router.refresh()
  }

  const showGiftCol = gifts.length > 0
  const colCount = 8 + (showGiftCol ? 1 : 0) + (showAttendance ? 1 : 0)
  const [groupByDept, setGroupByDept] = useState(false)
  const [distributorNames, setDistributorNames] = useState<Record<string, string>>({})

  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`employee-table-${campaignId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'gift_tokens', filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          const updated = payload.new as TokenRow
          setRows((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)))
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gift_tokens', filter: `campaign_id=eq.${campaignId}` },
        (payload) => {
          const inserted = payload.new as TokenRow
          setRows((prev) => [...prev, inserted])
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [campaignId])

  function handleExport() {
    const a = document.createElement('a')
    a.href = `/api/campaigns/${campaignId}/export`
    a.download = `campaign-${campaignId}.csv`
    a.click()
  }

  async function handleRemove(tokenId: string) {
    const res = await fetch(`/api/campaigns/${campaignId}/employees`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tokenId }),
    })
    if (res.ok) setRows((prev) => prev.filter((r) => r.id !== tokenId))
  }

  const hasDepts = rows.some((r) => r.department != null)

  // Fetch assigned distributors once on mount
  useEffect(() => {
    if (isDraft) return
    fetch(`/api/campaigns/${campaignId}/distributors`)
      .then((r) => r.json())
      .then((data) => {
        const map: Record<string, string> = {}
        for (const d of data.distributors ?? []) map[d.userId] = d.name
        setDistributorNames(map)
      })
      .catch(() => {})
  }, [campaignId, isDraft])

  // Resolve names for redeemed_by IDs not in the distributors map (e.g. admins)
  useEffect(() => {
    if (isDraft) return
    const unresolved = [...new Set(
      rows.filter((r) => r.redeemed_by && !distributorNames[r.redeemed_by]).map((r) => r.redeemed_by!)
    )]
    if (unresolved.length === 0) return
    fetch('/api/users/resolve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: unresolved }),
    })
      .then((r) => r.json())
      .then(({ users }) => {
        if (!users?.length) return
        setDistributorNames((prev) => {
          const next = { ...prev }
          for (const u of users) next[u.id] = u.name
          return next
        })
      })
      .catch(() => {})
  }, [campaignId, isDraft, rows, distributorNames])

  useEffect(() => {
    if (!hasDepts) setGroupByDept(false)
  }, [hasDepts])

  const filteredRows = search.trim()
    ? rows.filter((r) => {
        const q = search.toLowerCase()
        return (
          r.employee_name.toLowerCase().includes(q) ||
          (r.phone_number && r.phone_number.includes(q)) ||
          (r.department && r.department.toLowerCase().includes(q))
        )
      })
    : rows

  // Client-side pagination of the flat view so 1000+ tokens render ~30 at a time.
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const pageRows = filteredRows.slice(pageStart, pageStart + PAGE_SIZE)

  type GroupHeader = { _type: 'header'; department: string; claimed: number; total: number }
  type TableRow = TokenRow | GroupHeader

  function buildGroupedRows(): TableRow[] {
    const groups = new Map<string, TokenRow[]>()
    for (const row of filteredRows) {
      const key = row.department ?? 'No department'
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(row)
    }
    const sorted = [...groups.entries()].sort(([a], [b]) => {
      if (a === 'No department') return 1
      if (b === 'No department') return -1
      return a.localeCompare(b)
    })
    const result: TableRow[] = []
    for (const [dept, deptRows] of sorted) {
      const sortedRows = [...deptRows].sort((a, b) => {
        if (a.redeemed !== b.redeemed) return a.redeemed ? 1 : -1
        return a.employee_name.localeCompare(b.employee_name)
      })
      result.push({ _type: 'header', department: dept, claimed: deptRows.filter((r) => r.redeemed).length, total: deptRows.length })
      result.push(...sortedRows)
    }
    return result
  }

  return (
    <>
      <div className="bg-white rounded-xl border border-zinc-200 p-5 flex flex-col min-h-0">
        <div className="flex flex-col sm:flex-row flex-wrap items-start sm:items-center justify-between gap-3 mb-4">
          <h2 className="font-semibold text-zinc-900">{t('Employees')} <span className="text-zinc-400 font-normal">({rows.length})</span></h2>
          <div className="flex items-center gap-2">
            <input
              type="text"
              placeholder={t('Search employees…')}
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              className="border border-zinc-200 rounded-lg px-3 py-1.5 text-sm w-full sm:w-48 focus:outline-none focus:ring-2 ring-brand focus:border-transparent"
            />
            <button
              onClick={handleExport}
              className="border border-zinc-200 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-700 hover-brand transition-colors"
            >
              {t('Export CSV')}
            </button>
            {hasDepts && (
              <button
                onClick={() => setGroupByDept((v) => !v)}
                className={`border rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  groupByDept
                    ? 'border-brand bg-brand-soft text-indigo-700'
                    : 'border-zinc-200 text-zinc-700 hover-brand'
                }`}
              >
                {t('By department')}
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="text-sm w-full border-collapse">
            <thead>
              <tr className="text-xs text-zinc-400 border-b border-zinc-100">
                <th className="px-3 py-2 font-medium text-start">{t('Name')}</th>
                <th className="px-3 py-2 font-medium text-start">{t('Phone')}</th>
                <th className="px-3 py-2 font-medium text-start">{t('Department')}</th>
                {showGiftCol && <th className="px-3 py-2 font-medium text-start">{t('Gift')}</th>}
                {showAttendance && <th className="px-3 py-2 font-medium text-start">{t('Arriving')}</th>}
                <th className="px-3 py-2 font-medium text-start">SMS</th>
                <th className="px-3 py-2 font-medium text-start">{t('Claimed')}</th>
                <th className="px-3 py-2 font-medium text-start">{t('Claimed At')}</th>
                <th className="px-3 py-2 font-medium text-start">{t('Distributor')}</th>
                <th className="px-3 py-2 font-medium w-8" />
              </tr>
            </thead>
            <tbody>
              {groupByDept
                ? buildGroupedRows().map((row) =>
                    '_type' in row ? (
                      <tr key={`header-${row.department}`} className="bg-zinc-50">
                        <td colSpan={colCount} className="px-3 py-1.5 text-xs font-semibold text-zinc-500">
                          {row.department} · {row.claimed}/{row.total} claimed
                        </td>
                      </tr>
                    ) : (
                      <tr
                        key={row.id}
                        className={`border-b border-zinc-50 transition-colors duration-500 ${row.redeemed ? 'bg-green-50' : 'hover-brand'}`}
                      >
                        <td className="px-3 py-2.5 font-medium text-zinc-800">{row.employee_name}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-zinc-500">{row.phone_number ? <span dir="ltr">{maskPhone(row.phone_number)}</span> : <span className="text-zinc-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-zinc-500">{row.department ?? <span className="text-zinc-300">—</span>}</td>
                        {showGiftCol && (
                          <td className="px-3 py-1.5">
                            <GiftCell
                              giftId={row.gift_id}
                              gifts={gifts}
                              giftMap={giftMap}
                              editable={canEditGift}
                              onChange={(giftId) => changeGift(row.id, giftId)}
                            />
                          </td>
                        )}
                        {showAttendance && (
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-1.5">
                              <AttendeeCountCell
                                attending={row.attending}
                                attendeeCount={row.attendee_count}
                                editable={canEditAttendance}
                                onChange={(value) => changeAttendance(row.id, value)}
                              />
                              {row.arrived_count != null && <span className="text-xs text-green-600 font-medium">→ {row.arrived_count}</span>}
                            </div>
                          </td>
                        )}
                        <td className="px-3 py-2.5">
                          {!row.phone_number
                            ? <span className="text-zinc-400 text-xs font-medium">{t('QR only')}</span>
                            : row.sms_sent_at
                              ? <span className="text-green-600 text-xs font-medium">{t('✓ Sent')}</span>
                              : isDraft ? <span className="text-zinc-300">—</span> : <span className="text-amber-500 text-xs font-medium">{t('Not sent')}</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {row.redeemed
                            ? <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">{t('Claimed')}</span>
                            : <span className="text-zinc-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-zinc-400">
                          {row.redeemed_at ? new Date(row.redeemed_at).toLocaleString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : <span className="text-zinc-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-zinc-400">
                          {row.redeemed_by
                            ? distributorNames[row.redeemed_by] ?? row.redeemed_by
                            : <span className="text-zinc-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {isDraft ? (
                            <button
                              onClick={() => handleRemove(row.id)}
                              className="p-1 rounded text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                              aria-label={`Remove ${row.employee_name}`}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          ) : (
                            <button
                              onClick={() => row.qr_image_url && setEnlarged(row as TokenRow & { qr_image_url: string })}
                              disabled={!row.qr_image_url}
                              className={`p-1 rounded transition-colors ${row.qr_image_url ? 'text-zinc-400 hover-brand-text hover-brand' : 'text-zinc-200 cursor-not-allowed'}`}
                              aria-label={row.qr_image_url ? `View QR for ${row.employee_name}` : 'QR generating'}
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                              </svg>
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  )
                : pageRows.map((r) => (
                    <tr
                      key={r.id}
                      className={`border-b border-zinc-50 transition-colors duration-500 ${r.redeemed ? 'bg-green-50' : 'hover-brand'}`}
                    >
                      <td className="px-3 py-2.5 font-medium text-zinc-800">{r.employee_name}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-zinc-500">{r.phone_number ? maskPhone(r.phone_number) : <span className="text-zinc-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-zinc-500">{r.department ?? <span className="text-zinc-300">—</span>}</td>
                      {showGiftCol && (
                        <td className="px-3 py-1.5">
                          <GiftCell
                            giftId={r.gift_id}
                            gifts={gifts}
                            giftMap={giftMap}
                            editable={canEditGift}
                            onChange={(giftId) => changeGift(r.id, giftId)}
                          />
                        </td>
                      )}
                      {showAttendance && (
                        <td className="px-3 py-1.5">
                          <div className="flex items-center gap-1.5">
                            <AttendeeCountCell
                              attending={r.attending}
                              attendeeCount={r.attendee_count}
                              editable={canEditAttendance}
                              onChange={(value) => changeAttendance(r.id, value)}
                            />
                            {r.arrived_count != null && <span className="text-xs text-green-600 font-medium">→ {r.arrived_count}</span>}
                          </div>
                        </td>
                      )}
                      <td className="px-3 py-2.5">
                        {!r.phone_number
                          ? <span className="text-zinc-400 text-xs font-medium">{t('QR only')}</span>
                          : r.sms_sent_at
                            ? <span className="text-green-600 text-xs font-medium">{t('✓ Sent')}</span>
                            : <span className="text-zinc-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {r.redeemed
                          ? <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">{t('Claimed')}</span>
                          : <span className="text-zinc-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-zinc-400">
                        {r.redeemed_at ? new Date(r.redeemed_at).toLocaleString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) : <span className="text-zinc-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-zinc-400">
                        {r.redeemed_by
                          ? distributorNames[r.redeemed_by] ?? r.redeemed_by
                          : <span className="text-zinc-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {isDraft ? (
                          <button
                            onClick={() => handleRemove(r.id)}
                            className="p-1 rounded text-zinc-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                            aria-label={`Remove ${r.employee_name}`}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        ) : (
                          <button
                            onClick={() => r.qr_image_url && setEnlarged(r as TokenRow & { qr_image_url: string })}
                            disabled={!r.qr_image_url}
                            className={`p-1 rounded transition-colors ${r.qr_image_url ? 'text-zinc-400 hover-brand-text hover-brand' : 'text-zinc-200 cursor-not-allowed'}`}
                            aria-label={r.qr_image_url ? `View QR for ${r.employee_name}` : 'QR generating'}
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={colCount} className="px-3 py-12 text-center text-zinc-400 text-sm">
                    {search.trim()
                      ? t('No employees match your search.')
                      : t('No employees yet. Upload a CSV or add one manually.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!groupByDept && filteredRows.length > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-3 pt-4 mt-1 border-t border-zinc-100 text-sm text-zinc-500">
            <span>{t('Showing')} {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filteredRows.length)} {t('of')} {filteredRows.length}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="border border-zinc-200 rounded-lg px-3 py-1 font-medium text-zinc-700 hover-brand transition-colors disabled:opacity-40"
              >
                {t('Prev')}
              </button>
              <span className="tabular-nums">{currentPage} / {totalPages}</span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="border border-zinc-200 rounded-lg px-3 py-1 font-medium text-zinc-700 hover-brand transition-colors disabled:opacity-40"
              >
                {t('Next')}
              </button>
            </div>
          </div>
        )}
      </div>

      {showAddModal && (
        <AddEmployeeModal
          campaignId={campaignId}
          onClose={() => setShowAddModal(false)}
        />
      )}
      {enlarged && <EmployeeQrModal target={enlarged} onClose={closeQr} />}
    </>
  )
}
