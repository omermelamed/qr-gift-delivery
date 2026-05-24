'use client'

import { useState, useEffect, useCallback } from 'react'
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
            className="text-zinc-400 hover:text-zinc-700 transition-colors p-1 rounded-lg hover:bg-zinc-100"
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
            {maskPhone(target.phone_number)}
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

export function EmployeeTable({
  campaignId,
  initialRows,
  isDraft,
  gifts = [],
}: {
  campaignId: string
  initialRows: TokenRow[]
  isDraft: boolean
  gifts?: { id: string; name: string }[]
}) {
  const t = useT()
  const [rows, setRows] = useState(initialRows)
  // Sync rows when the server re-renders via router.refresh() (e.g. after populate)
  useEffect(() => { setRows(initialRows) }, [initialRows])
  const [showAddModal, setShowAddModal] = useState(false)
  const [enlarged, setEnlarged] = useState<(TokenRow & { qr_image_url: string }) | null>(null)
  const closeQr = useCallback(() => setEnlarged(null), [])

  const GIFT_COLORS = ['#6366f1', '#8b5cf6', '#f59e0b', '#14b8a6', '#f43f5e', '#f97316']
  const giftMap = new Map(gifts.map((g, i) => [g.id, { name: g.name, color: GIFT_COLORS[i % GIFT_COLORS.length] }]))
  const showGiftCol = gifts.length > 0
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

  type GroupHeader = { _type: 'header'; department: string; claimed: number; total: number }
  type TableRow = TokenRow | GroupHeader

  function buildGroupedRows(): TableRow[] {
    const groups = new Map<string, TokenRow[]>()
    for (const row of rows) {
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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h2 className="font-semibold text-zinc-900">{t('Employees')} <span className="text-zinc-400 font-normal">({rows.length})</span></h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="border border-zinc-200 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              {t('Export CSV')}
            </button>
            {hasDepts && (
              <button
                onClick={() => setGroupByDept((v) => !v)}
                className={`border rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  groupByDept
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                    : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'
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
              <tr className="text-left text-xs text-zinc-400 border-b border-zinc-100">
                <th className="px-3 py-2 font-medium">{t('Name')}</th>
                <th className="px-3 py-2 font-medium">{t('Phone')}</th>
                <th className="px-3 py-2 font-medium">{t('Department')}</th>
                {showGiftCol && <th className="px-3 py-2 font-medium">{t('Gift')}</th>}
                <th className="px-3 py-2 font-medium">SMS</th>
                <th className="px-3 py-2 font-medium">{t('Claimed')}</th>
                <th className="px-3 py-2 font-medium">{t('Claimed At')}</th>
                <th className="px-3 py-2 font-medium">{t('Distributor')}</th>
                {!isDraft && <th className="px-3 py-2 font-medium w-8" />}
              </tr>
            </thead>
            <tbody>
              {groupByDept
                ? buildGroupedRows().map((row) =>
                    '_type' in row ? (
                      <tr key={`header-${row.department}`} className="bg-zinc-50">
                        <td colSpan={showGiftCol ? (isDraft ? 8 : 9) : (isDraft ? 7 : 8)} className="px-3 py-1.5 text-xs font-semibold text-zinc-500">
                          {row.department} · {row.claimed}/{row.total} claimed
                        </td>
                      </tr>
                    ) : (
                      <tr
                        key={row.id}
                        className={`border-b border-zinc-50 transition-colors duration-500 ${row.redeemed ? 'bg-green-50' : 'hover:bg-zinc-50'}`}
                      >
                        <td className="px-3 py-2.5 font-medium text-zinc-800">{row.employee_name}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-zinc-500">{row.phone_number ? maskPhone(row.phone_number) : <span className="text-zinc-300">—</span>}</td>
                        <td className="px-3 py-2.5 text-zinc-500">{row.department ?? <span className="text-zinc-300">—</span>}</td>
                        {showGiftCol && (
                          <td className="px-3 py-2.5">
                            {row.gift_id && giftMap.get(row.gift_id) ? (
                              <span
                                className="text-white text-xs font-medium px-2 py-0.5 rounded-full"
                                style={{ backgroundColor: giftMap.get(row.gift_id)!.color }}
                              >
                                {giftMap.get(row.gift_id)!.name}
                              </span>
                            ) : (
                              <span className="text-zinc-300 text-xs">—</span>
                            )}
                          </td>
                        )}
                        <td className="px-3 py-2.5">
                          {row.sms_sent_at
                            ? <span className="text-green-600 text-xs font-medium">{t('✓ Sent')}</span>
                            : isDraft ? <span className="text-zinc-300">—</span> : <span className="text-amber-500 text-xs font-medium">{t('Not sent')}</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {row.redeemed
                            ? <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">{t('Claimed')}</span>
                            : <span className="text-zinc-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-zinc-400">
                          {row.redeemed_at ? new Date(row.redeemed_at).toLocaleString() : <span className="text-zinc-300">—</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-zinc-400">
                          {row.redeemed_by
                            ? distributorNames[row.redeemed_by] ?? row.redeemed_by
                            : <span className="text-zinc-300">—</span>}
                        </td>
                        {!isDraft && (
                          <td className="px-3 py-2.5">
                            <button
                              onClick={() => row.qr_image_url && setEnlarged(row as TokenRow & { qr_image_url: string })}
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
                      </tr>
                    )
                  )
                : rows.map((r) => (
                    <tr
                      key={r.id}
                      className={`border-b border-zinc-50 transition-colors duration-500 ${r.redeemed ? 'bg-green-50' : 'hover:bg-zinc-50'}`}
                    >
                      <td className="px-3 py-2.5 font-medium text-zinc-800">{r.employee_name}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-zinc-500">{r.phone_number ? maskPhone(r.phone_number) : <span className="text-zinc-300">—</span>}</td>
                      <td className="px-3 py-2.5 text-zinc-500">{r.department ?? <span className="text-zinc-300">—</span>}</td>
                      {showGiftCol && (
                        <td className="px-3 py-2.5">
                          {r.gift_id && giftMap.get(r.gift_id) ? (
                            <span
                              className="text-white text-xs font-medium px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: giftMap.get(r.gift_id)!.color }}
                            >
                              {giftMap.get(r.gift_id)!.name}
                            </span>
                          ) : (
                            <span className="text-zinc-300 text-xs">—</span>
                          )}
                        </td>
                      )}
                      <td className="px-3 py-2.5">
                        {r.sms_sent_at
                          ? <span className="text-green-600 text-xs font-medium">{t('✓ Sent')}</span>
                          : <span className="text-zinc-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {r.redeemed
                          ? <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">{t('Claimed')}</span>
                          : <span className="text-zinc-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-zinc-400">
                        {r.redeemed_at ? new Date(r.redeemed_at).toLocaleString() : <span className="text-zinc-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-zinc-400">
                        {r.redeemed_by
                          ? distributorNames[r.redeemed_by] ?? r.redeemed_by
                          : <span className="text-zinc-300">—</span>}
                      </td>
                      {!isDraft && (
                        <td className="px-3 py-2.5">
                          <button
                            onClick={() => r.qr_image_url && setEnlarged(r as TokenRow & { qr_image_url: string })}
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
                    </tr>
                  ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={showGiftCol ? (isDraft ? 8 : 9) : (isDraft ? 7 : 8)} className="px-3 py-12 text-center text-zinc-400 text-sm">
                    {t('No employees yet. Upload a CSV or add one manually.')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
