'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { read, utils } from 'xlsx'
import { normalizePhone } from '@/lib/phone'

type ParsedRow = { name: string; phone_number: string; department?: string }
type ValidatedRow = ParsedRow & { _status: 'valid' | 'invalid'; _reason?: string }

function validateRows(raw: ParsedRow[]): ValidatedRow[] {
  return raw.map((row) => {
    if (!row.name?.trim()) return { ...row, _status: 'invalid', _reason: 'Missing name' }
    if (!normalizePhone(row.phone_number ?? '')) return { ...row, _status: 'invalid', _reason: 'Invalid phone' }
    return { ...row, _status: 'valid' }
  })
}

export function TokenUploader({ campaignId }: { campaignId: string }) {
  const [rows, setRows] = useState<ValidatedRow[]>([])
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const router = useRouter()

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setMessage(null)
    const buf = await file.arrayBuffer()
    const wb = read(buf)
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const parsed: ParsedRow[] = utils.sheet_to_json(sheet, { defval: '' })
    setRows(validateRows(parsed))
  }, [])

  const validRows = rows.filter((r) => r._status === 'valid')
  const invalidCount = rows.length - validRows.length

  async function handleConfirm() {
    setUploading(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: validRows.map(({ name, phone_number, department }) => ({ name, phone_number, department })),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data.error ?? 'Upload failed', type: 'error' })
        return
      }
      setMessage({ text: `✓ ${data.inserted} employees uploaded`, type: 'success' })
      setRows([])
      router.refresh()
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="border rounded-xl p-5 bg-white">
      <h2 className="font-semibold mb-3">Upload employees</h2>
      <p className="text-xs text-gray-500 mb-3">
        Accepts .csv or .xlsx — columns: <code>name</code>, <code>phone_number</code>, <code>department</code> (optional)
      </p>

      <input
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={handleFile}
        className="text-sm mb-4"
      />

      {message && (
        <p className={`text-sm mb-3 ${message.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}

      {rows.length > 0 && (
        <>
          <p className="text-sm text-gray-600 mb-3">
            <span className="text-green-700 font-medium">{validRows.length} valid</span>
            {invalidCount > 0 && <span className="text-red-600 font-medium"> · {invalidCount} invalid</span>}
          </p>

          <div className="overflow-x-auto mb-4 border rounded-lg">
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr className="bg-gray-50">
                  <th className="border-b px-3 py-2 text-left">Name</th>
                  <th className="border-b px-3 py-2 text-left">Phone</th>
                  <th className="border-b px-3 py-2 text-left">Department</th>
                  <th className="border-b px-3 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((r, i) => (
                  <tr key={i} className={r._status === 'invalid' ? 'bg-red-50' : ''}>
                    <td className="border-b px-3 py-1.5">{r.name || <span className="text-gray-400">—</span>}</td>
                    <td className="border-b px-3 py-1.5 font-mono">{r.phone_number || <span className="text-gray-400">—</span>}</td>
                    <td className="border-b px-3 py-1.5">{r.department || <span className="text-gray-400">—</span>}</td>
                    <td className="border-b px-3 py-1.5">
                      {r._status === 'invalid'
                        ? <span className="text-red-600">{r._reason}</span>
                        : <span className="text-green-600">✓</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 10 && (
              <p className="text-xs text-gray-400 px-3 py-2">+{rows.length - 10} more rows not shown</p>
            )}
          </div>

          <button
            onClick={handleConfirm}
            disabled={validRows.length === 0 || uploading}
            className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50 hover:bg-gray-800 transition-colors"
          >
            {uploading ? 'Uploading…' : `Confirm Upload (${validRows.length} employees)`}
          </button>
        </>
      )}
    </div>
  )
}
