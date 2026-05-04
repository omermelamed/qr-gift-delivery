'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { AddEmployeeModal } from '@/components/admin/AddEmployeeModal'

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

function maskPhone(phone: string): string {
  return phone.replace(/\d(?=\d{4})/g, '•')
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
  const [rows, setRows] = useState(initialRows)
  // Sync rows when the server re-renders via router.refresh() (e.g. after populate)
  useEffect(() => { setRows(initialRows) }, [initialRows])
  const [showAddModal, setShowAddModal] = useState(false)

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
          <h2 className="font-semibold text-zinc-900">Employees <span className="text-zinc-400 font-normal">({rows.length})</span></h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="border border-zinc-200 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
            >
              Export CSV
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
                By department
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="text-sm w-full border-collapse">
            <thead>
              <tr className="text-left text-xs text-zinc-400 border-b border-zinc-100">
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Phone</th>
                <th className="px-3 py-2 font-medium">Department</th>
                {showGiftCol && <th className="px-3 py-2 font-medium">Gift</th>}
                <th className="px-3 py-2 font-medium">SMS</th>
                <th className="px-3 py-2 font-medium">Claimed</th>
                <th className="px-3 py-2 font-medium">Claimed At</th>
                <th className="px-3 py-2 font-medium">Distributor</th>
              </tr>
            </thead>
            <tbody>
              {groupByDept
                ? buildGroupedRows().map((row) =>
                    '_type' in row ? (
                      <tr key={`header-${row.department}`} className="bg-zinc-50">
                        <td colSpan={showGiftCol ? 8 : 7} className="px-3 py-1.5 text-xs font-semibold text-zinc-500">
                          {row.department} · {row.claimed}/{row.total} claimed
                        </td>
                      </tr>
                    ) : (
                      <tr
                        key={row.id}
                        className={`border-b border-zinc-50 transition-colors duration-500 ${row.redeemed ? 'bg-green-50' : 'hover:bg-zinc-50'}`}
                      >
                        <td className="px-3 py-2.5 font-medium text-zinc-800">{row.employee_name}</td>
                        <td className="px-3 py-2.5 font-mono text-xs text-zinc-500">{maskPhone(row.phone_number)}</td>
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
                            ? <span className="text-green-600 text-xs font-medium">✓ Sent</span>
                            : isDraft ? <span className="text-zinc-300">—</span> : <span className="text-amber-500 text-xs font-medium">Not sent</span>}
                        </td>
                        <td className="px-3 py-2.5">
                          {row.redeemed
                            ? <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">Claimed</span>
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
                      </tr>
                    )
                  )
                : rows.map((r) => (
                    <tr
                      key={r.id}
                      className={`border-b border-zinc-50 transition-colors duration-500 ${r.redeemed ? 'bg-green-50' : 'hover:bg-zinc-50'}`}
                    >
                      <td className="px-3 py-2.5 font-medium text-zinc-800">{r.employee_name}</td>
                      <td className="px-3 py-2.5 font-mono text-xs text-zinc-500">{maskPhone(r.phone_number)}</td>
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
                          ? <span className="text-green-600 text-xs font-medium">✓ Sent</span>
                          : <span className="text-zinc-300">—</span>}
                      </td>
                      <td className="px-3 py-2.5">
                        {r.redeemed
                          ? <span className="bg-green-100 text-green-700 text-xs font-semibold px-2 py-0.5 rounded-full">Claimed</span>
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
                    </tr>
                  ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={showGiftCol ? 8 : 7} className="px-3 py-12 text-center text-zinc-400 text-sm">
                    No employees yet. Upload a CSV or add one manually.
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
    </>
  )
}
