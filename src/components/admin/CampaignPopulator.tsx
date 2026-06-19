'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { read, utils } from 'xlsx'
import { normalizePhone } from '@/lib/phone'
import { normalizeCSVRow } from '@/lib/csv'
import { DirectoryEmployeePicker } from '@/components/admin/DirectoryEmployeePicker'
import { useT } from '@/lib/i18n/useT'

type Tab = 'upload' | 'directory' | 'clone'
type ParsedRow = { name: string; phone_number: string; department?: string }
type ValidatedRow = ParsedRow & { _status: 'valid' | 'invalid'; _reason?: string }
type CampaignOption = { id: string; name: string; campaign_date: string | null }
type ExistingToken = { employee_name: string; phone_number: string | null }

function validateRows(raw: ParsedRow[]): ValidatedRow[] {
  return raw.map((row) => {
    if (!row.name?.trim()) return { ...row, _status: 'invalid', _reason: 'Missing name' }
    if (!normalizePhone(row.phone_number ?? '')) return { ...row, _status: 'invalid', _reason: 'Invalid phone' }
    return { ...row, _status: 'valid' }
  })
}

export function CampaignPopulator({ campaignId, existingTokens = [] }: { campaignId: string; existingTokens?: ExistingToken[] }) {
  const [tab, setTab] = useState<Tab>('upload')
  const [rows, setRows] = useState<ValidatedRow[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [saveToDirectory, setSaveToDirectory] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([])
  const [cloneSource, setCloneSource] = useState('')
  const [cloning, setCloning] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const t = useT()

  useEffect(() => {
    if (tab === 'clone' && campaigns.length === 0) {
      fetch('/api/campaigns').then((r) => r.json()).then((d) => {
        const others = (d.campaigns ?? []).filter((c: CampaignOption) => c.id !== campaignId)
        setCampaigns(others)
      })
    }
  }, [tab, campaignId, campaigns.length])

  async function processFile(file: File) {
    setMessage(null)
    const buf = await file.arrayBuffer()
    const wb = read(buf)
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const raw: Record<string, string>[] = utils.sheet_to_json(sheet, { defval: '' })
    const parsed: ParsedRow[] = raw.map(normalizeCSVRow)
    setRows(validateRows(parsed))
  }

  const validRows = rows.filter((r) => r._status === 'valid')
  const invalidCount = rows.length - validRows.length

  async function handleUploadConfirm() {
    setUploading(true)
    setMessage(null)
    try {
      if (saveToDirectory) {
        const importRes = await fetch('/api/employees/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: validRows.map(({ name, phone_number, department }) => ({ employee_name: name, phone: phone_number, department })) }),
        })
        if (!importRes.ok) {
          const importData = await importRes.json()
          setMessage({ text: importData.error ?? 'Failed to save to directory', type: 'error' })
          setUploading(false)
          return
        }
      }
      const res = await fetch(`/api/campaigns/${campaignId}/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: validRows.map(({ name, phone_number, department }) => ({ name, phone_number, department })) }),
      })
      const data = await res.json()
      if (!res.ok) { setMessage({ text: data.error ?? 'Upload failed', type: 'error' }); return }
      setMessage({ text: `${data.inserted} ${t('employees uploaded')}${saveToDirectory ? ` ${t('and saved to directory')}` : ''}`, type: 'success' })
      setRows([])
      router.refresh()
    } finally {
      setUploading(false)
    }
  }

  async function handleClone() {
    if (!cloneSource) return
    setCloning(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'clone', sourceCampaignId: cloneSource }),
      })
      const data = await res.json()
      if (!res.ok) { setMessage({ text: data.error ?? 'Clone failed', type: 'error' }); return }
      setMessage({ text: `${data.inserted} ${t('employees cloned')}`, type: 'success' })
      router.refresh()
    } finally {
      setCloning(false)
    }
  }

  const tabBtn = (t: Tab, label: string) => (
    <button
      onClick={() => { setTab(t); setMessage(null) }}
      className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      <h2 className="font-semibold text-zinc-900 mb-4">{t('Add employees')}</h2>

      {/* Tab bar */}
      <div className="flex bg-zinc-100 rounded-lg p-1 mb-5 gap-1">
        {tabBtn('upload', t('Upload file'))}
        {tabBtn('directory', t('From directory'))}
        {tabBtn('clone', t('Clone campaign'))}
      </div>

      {/* Upload tab */}
      {tab === 'upload' && (
        <>
          <p className="text-xs text-zinc-400 mb-3">
            {t('Columns:')} <code className="bg-zinc-100 px-1 rounded font-mono">name</code> / <code className="bg-zinc-100 px-1 rounded font-mono">שם</code>,{' '}
            <code className="bg-zinc-100 px-1 rounded font-mono">phone_number</code> / <code className="bg-zinc-100 px-1 rounded font-mono">טלפון</code>,{' '}
            <code className="bg-zinc-100 px-1 rounded font-mono">department</code> / <code className="bg-zinc-100 px-1 rounded font-mono">מחלקה</code> ({t('optional')})
          </p>
          <div
            role="button" tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); const f = e.dataTransfer.files[0]; if (f) processFile(f) }}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${isDragging ? 'border-indigo-400 bg-indigo-50' : 'border-zinc-200 hover:border-indigo-300 hover:bg-zinc-50'}`}
          >
            <svg className="w-8 h-8 text-zinc-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-zinc-500"><span className="font-medium text-indigo-600">{t('Click to browse')}</span> {t('or drag and drop')}</p>
            <p className="text-xs text-zinc-400 mt-1">.csv {t('or')} .xlsx</p>
            <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) processFile(f) }} className="hidden" />
          </div>

          {rows.length > 0 && (
            <div className="mt-4">
              <p className="text-sm text-zinc-600 mb-3">
                <span className="text-green-700 font-medium">{validRows.length} {t('valid')}</span>
                {invalidCount > 0 && <span className="text-red-600 font-medium"> · {invalidCount} {t('invalid')}</span>}
              </p>
              <label className="flex items-center gap-3 mb-4 cursor-pointer">
                <input type="checkbox" checked={saveToDirectory} onChange={(e) => setSaveToDirectory(e.target.checked)}
                  className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500" />
                <span className="text-sm text-zinc-700">{t('Also save to employee directory')}</span>
              </label>
              <button onClick={handleUploadConfirm} disabled={validRows.length === 0 || uploading}
                className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all">
                {uploading ? t('Uploading…') : `${t('Confirm Upload')} (${validRows.length} ${t('employees')})`}
              </button>
            </div>
          )}
        </>
      )}

      {/* Directory tab */}
      {tab === 'directory' && (
        <DirectoryEmployeePicker campaignId={campaignId} existingTokens={existingTokens} onAdded={() => {
          router.refresh()
          setMessage({ text: t('Employees added from directory'), type: 'success' })
        }} />
      )}

      {/* Clone tab */}
      {tab === 'clone' && (
        <div>
          <p className="text-xs text-zinc-400 mb-3">{t('Copy all employees from another campaign into this one.')}</p>
          {campaigns.length === 0 ? (
            <p className="text-sm text-zinc-400 text-center py-6">{t('No other campaigns to clone from.')}</p>
          ) : (
            <>
              <select value={cloneSource} onChange={(e) => setCloneSource(e.target.value)}
                className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent mb-4">
                <option value="">{t('Select a campaign…')}</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.campaign_date ? ` (${c.campaign_date})` : ''}</option>
                ))}
              </select>
              <button onClick={handleClone} disabled={!cloneSource || cloning}
                className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all">
                {cloning ? t('Cloning…') : t('Clone employees')}
              </button>
            </>
          )}
        </div>
      )}

      {message && (
        <p className={`text-sm mt-3 ${message.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>
          {message.text}
        </p>
      )}
    </div>
  )
}
