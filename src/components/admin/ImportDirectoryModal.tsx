'use client'

import { useState, useRef } from 'react'
import { read, utils } from 'xlsx'
import { useT } from '@/lib/i18n/useT'

type Props = { onClose: () => void; onImported: (count: number) => void }
type ParsedRow = { employee_name: string; phone: string; department?: string }

export function ImportDirectoryModal({ onClose, onImported }: Props) {
  const t = useT()
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function processFile(file: File) {
    const buf = await file.arrayBuffer()
    const wb = read(buf)
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const raw: Record<string, string>[] = utils.sheet_to_json(sheet, { defval: '' })
    const parsed: ParsedRow[] = raw
      .map((r) => ({
        employee_name: (r.name ?? r.employee_name ?? '').trim(),
        phone: (r.phone_number ?? r.phone ?? '').trim(),
        department: (r.department ?? '').trim() || undefined,
      }))
      .filter((r) => r.employee_name && r.phone)
    setRows(parsed)
  }

  async function handleImport() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/employees/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? t('Import failed')); return }
      onImported(data.upserted)
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6">
        <h2 className="text-lg font-semibold text-zinc-900 mb-5">{t('Import employees')}</h2>
        {error && <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">{error}</p>}

        <div
          role="button" tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f) }}
          className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors mb-4 ${isDragging ? 'border-indigo-400 bg-indigo-50' : 'border-zinc-200 hover:border-indigo-300 hover:bg-zinc-50'}`}
        >
          <p className="text-sm text-zinc-500"><span className="font-medium text-indigo-600">{t('Click to browse')}</span> {t('or drag and drop')}</p>
          <p className="text-xs text-zinc-400 mt-1">.csv or .xlsx · columns: name, phone_number, department</p>
          <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls" onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f) }} className="hidden" />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              const csv = 'name,phone_number,department\nJane Smith,+1234567890,Engineering\nJohn Doe,+0987654321,Marketing'
              const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
              const a = document.createElement('a')
              a.href = url
              a.download = 'employees_template.csv'
              a.click()
              URL.revokeObjectURL(url)
            }}
            className="mt-3 inline-flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {t('Download template')}
          </button>
        </div>

        {rows.length > 0 && (
          <>
            <p className="text-sm text-zinc-600 mb-3"><span className="font-medium text-green-700">{rows.length} {t('valid employees ready to import')}</span></p>
            <div className="border border-zinc-100 rounded-xl overflow-hidden mb-4 max-h-48 overflow-y-auto">
              <table className="text-xs w-full border-collapse">
                <thead>
                  <tr className="bg-zinc-50 text-zinc-500">
                    <th className="border-b border-zinc-100 px-3 py-2 text-left font-medium">{t('Name')}</th>
                    <th className="border-b border-zinc-100 px-3 py-2 text-left font-medium">{t('Phone')}</th>
                    <th className="border-b border-zinc-100 px-3 py-2 text-left font-medium">{t('Department')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 20).map((r, i) => (
                    <tr key={i} className="border-b border-zinc-50">
                      <td className="px-3 py-1.5 text-zinc-700">{r.employee_name}</td>
                      <td className="px-3 py-1.5 font-mono text-zinc-500">{r.phone}</td>
                      <td className="px-3 py-1.5 text-zinc-400">{r.department ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 20 && <p className="text-xs text-zinc-400 px-3 py-2">+{rows.length - 20} {t('more rows')}</p>}
            </div>
          </>
        )}

        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 border border-zinc-200 rounded-lg px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">{t('Cancel')}</button>
          <button onClick={handleImport} disabled={rows.length === 0 || loading} className="flex-1 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all">
            {loading ? t('Importing…') : `${t('Import')} ${rows.length} ${t('employees')}`}
          </button>
        </div>
      </div>
    </div>
  )
}
