'use client'

import { useState, useRef } from 'react'
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
  const [isDragging, setIsDragging] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  async function processFile(file: File) {
    setMessage(null)
    const buf = await file.arrayBuffer()
    const wb = read(buf)
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const parsed: ParsedRow[] = utils.sheet_to_json(sheet, { defval: '' })
    setRows(validateRows(parsed))
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    await processFile(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }

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
      setMessage({ text: `${data.inserted} employees uploaded`, type: 'success' })
      setRows([])
      router.refresh()
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      <h2 className="font-semibold text-zinc-900 mb-1">Upload employees</h2>
      <p className="text-xs text-zinc-400 mb-4">
        Accepts .csv or .xlsx — columns: <code className="font-mono bg-zinc-100 px-1 rounded">name</code>,{' '}
        <code className="font-mono bg-zinc-100 px-1 rounded">phone_number</code>,{' '}
        <code className="font-mono bg-zinc-100 px-1 rounded">department</code> (optional)
      </p>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload CSV file"
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          isDragging
            ? 'border-indigo-400 bg-indigo-50'
            : 'border-zinc-200 hover:border-indigo-300 hover:bg-zinc-50'
        }`}
      >
        <svg className="w-8 h-8 text-zinc-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <p className="text-sm text-zinc-500">
          <span className="font-medium text-indigo-600">Click to browse</span> or drag and drop
        </p>
        <p className="text-xs text-zinc-400 mt-1">.csv or .xlsx</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          onChange={handleFile}
          className="hidden"
        />
      </div>

      {message && (
        <p className={`text-sm mt-3 ${message.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>
          {message.type === 'success' ? '✓ ' : '✗ '}{message.text}
        </p>
      )}

      {rows.length > 0 && (
        <div className="mt-4">
          <p className="text-sm text-zinc-600 mb-3">
            <span className="text-green-700 font-medium">{validRows.length} valid</span>
            {invalidCount > 0 && (
              <span className="text-red-600 font-medium"> · {invalidCount} invalid</span>
            )}
          </p>

          <div className="overflow-x-auto border border-zinc-100 rounded-xl mb-4">
            <table className="text-xs w-full border-collapse">
              <thead>
                <tr className="bg-zinc-50 text-zinc-500">
                  <th className="border-b border-zinc-100 px-3 py-2 text-left font-medium">Name</th>
                  <th className="border-b border-zinc-100 px-3 py-2 text-left font-medium">Phone</th>
                  <th className="border-b border-zinc-100 px-3 py-2 text-left font-medium">Department</th>
                  <th className="border-b border-zinc-100 px-3 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 10).map((r, i) => (
                  <tr key={i} className={r._status === 'invalid' ? 'bg-red-50' : ''}>
                    <td className="border-b border-zinc-100 px-3 py-1.5 text-zinc-700">
                      {r.name || <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="border-b border-zinc-100 px-3 py-1.5 font-mono text-zinc-600">
                      {r.phone_number || <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="border-b border-zinc-100 px-3 py-1.5 text-zinc-500">
                      {r.department || <span className="text-zinc-300">—</span>}
                    </td>
                    <td className="border-b border-zinc-100 px-3 py-1.5">
                      {r._status === 'invalid'
                        ? <span className="text-red-500">{r._reason}</span>
                        : <span className="text-green-600">✓</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length > 10 && (
              <p className="text-xs text-zinc-400 px-3 py-2">+{rows.length - 10} more rows not shown</p>
            )}
          </div>

          <button
            onClick={handleConfirm}
            disabled={validRows.length === 0 || uploading}
            className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all"
          >
            {uploading ? 'Uploading…' : `Confirm Upload (${validRows.length} employees)`}
          </button>
        </div>
      )}
    </div>
  )
}
