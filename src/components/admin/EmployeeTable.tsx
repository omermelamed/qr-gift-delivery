'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'

type TokenRow = {
  id: string
  employee_name: string
  phone_number: string
  department: string | null
  sms_sent_at: string | null
  redeemed: boolean
  redeemed_at: string | null
  redeemed_by: string | null
}

function maskPhone(phone: string): string {
  return phone.replace(/\d(?=\d{4})/g, '•')
}

export function EmployeeTable({
  campaignId,
  initialRows,
}: {
  campaignId: string
  initialRows: TokenRow[]
}) {
  const [rows, setRows] = useState(initialRows)
  const [resending, setResending] = useState(false)
  const [resendMsg, setResendMsg] = useState<string | null>(null)

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
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [campaignId])

  async function handleResend() {
    setResending(true)
    setResendMsg(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/resend`, { method: 'POST' })
      const data = await res.json()
      setResendMsg(`Resent to ${data.dispatched} employees${data.failed > 0 ? ` · ${data.failed} failed` : ''}`)
      setTimeout(() => setResendMsg(null), 4000)
    } finally {
      setResending(false)
    }
  }

  function handleExport() {
    const a = document.createElement('a')
    a.href = `/api/campaigns/${campaignId}/export`
    a.download = `campaign-${campaignId}.csv`
    a.click()
  }

  const unclaimedCount = rows.filter((r) => !r.redeemed).length

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5 flex flex-col min-h-0">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-semibold text-zinc-900">Employees <span className="text-zinc-400 font-normal">({rows.length})</span></h2>
        <div className="flex items-center gap-2">
          {resendMsg && <p className="text-sm text-green-700">{resendMsg}</p>}
          <button
            onClick={handleResend}
            disabled={resending || unclaimedCount === 0}
            className="border border-zinc-200 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-700 disabled:opacity-40 hover:bg-zinc-50 transition-colors"
          >
            {resending ? 'Resending…' : `Resend (${unclaimedCount})`}
          </button>
          <button
            onClick={handleExport}
            className="border border-zinc-200 rounded-lg px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="text-sm w-full border-collapse">
          <thead>
            <tr className="text-left text-xs text-zinc-400 border-b border-zinc-100">
              <th className="px-3 py-2 font-medium">Name</th>
              <th className="px-3 py-2 font-medium">Phone</th>
              <th className="px-3 py-2 font-medium">Department</th>
              <th className="px-3 py-2 font-medium">SMS</th>
              <th className="px-3 py-2 font-medium">Claimed</th>
              <th className="px-3 py-2 font-medium">Claimed At</th>
              <th className="px-3 py-2 font-medium">Distributor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={`border-b border-zinc-50 transition-colors duration-500 ${r.redeemed ? 'bg-green-50' : 'hover:bg-zinc-50'}`}
              >
                <td className="px-3 py-2.5 font-medium text-zinc-800">{r.employee_name}</td>
                <td className="px-3 py-2.5 font-mono text-xs text-zinc-500">{maskPhone(r.phone_number)}</td>
                <td className="px-3 py-2.5 text-zinc-500">{r.department ?? <span className="text-zinc-300">—</span>}</td>
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
                  {r.redeemed_by ?? <span className="text-zinc-300">—</span>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center text-zinc-400 text-sm">
                  No employees yet. Upload a CSV to get started.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
