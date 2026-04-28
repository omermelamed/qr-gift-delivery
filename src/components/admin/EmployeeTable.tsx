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
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'gift_tokens',
          filter: `campaign_id=eq.${campaignId}`,
        },
        (payload) => {
          const updated = payload.new as TokenRow
          setRows((prev) =>
            prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r))
          )
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
      setResendMsg(
        `Resent to ${data.dispatched} employees${data.failed > 0 ? ` · ${data.failed} failed` : ''}`
      )
      setTimeout(() => setResendMsg(null), 3000)
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
    <div className="border rounded-xl p-5 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="font-semibold">Employees ({rows.length})</h2>
        <div className="flex items-center gap-2">
          {resendMsg && <p className="text-sm text-green-700">{resendMsg}</p>}
          <button
            onClick={handleResend}
            disabled={resending || unclaimedCount === 0}
            className="border rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 hover:bg-gray-50 transition-colors"
          >
            {resending ? 'Resending…' : `Resend to unclaimed (${unclaimedCount})`}
          </button>
          <button
            onClick={handleExport}
            className="border rounded-lg px-3 py-1.5 text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            Export CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="text-sm w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 text-left text-xs text-gray-600">
              <th className="border-b px-3 py-2">Name</th>
              <th className="border-b px-3 py-2">Phone</th>
              <th className="border-b px-3 py-2">Department</th>
              <th className="border-b px-3 py-2">SMS</th>
              <th className="border-b px-3 py-2">Claimed</th>
              <th className="border-b px-3 py-2">Claimed At</th>
              <th className="border-b px-3 py-2">Distributor</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={r.redeemed ? 'bg-green-50' : ''}>
                <td className="border-b px-3 py-2">{r.employee_name}</td>
                <td className="border-b px-3 py-2 font-mono text-xs">{maskPhone(r.phone_number)}</td>
                <td className="border-b px-3 py-2 text-gray-600">{r.department ?? '—'}</td>
                <td className="border-b px-3 py-2">{r.sms_sent_at ? '✓ Sent' : '—'}</td>
                <td className="border-b px-3 py-2">{r.redeemed ? '✓' : '—'}</td>
                <td className="border-b px-3 py-2 text-xs text-gray-500">
                  {r.redeemed_at ? new Date(r.redeemed_at).toLocaleString() : '—'}
                </td>
                <td className="border-b px-3 py-2 text-xs text-gray-500">
                  {r.redeemed_by ?? '—'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-gray-400 text-sm">
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
