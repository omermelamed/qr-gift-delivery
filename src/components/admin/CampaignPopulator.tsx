'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { normalizePhone } from '@/lib/phone'
import { normalizeCSVRow, parseSheetRows } from '@/lib/csv'
import { useT } from '@/lib/i18n/useT'

type Tab = 'upload' | 'manual' | 'clone'
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
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  const [campaigns, setCampaigns] = useState<CampaignOption[]>([])
  const [cloneSource, setCloneSource] = useState('')
  const [cloning, setCloning] = useState(false)
  const [manualName, setManualName] = useState('')
  const [manualPhone, setManualPhone] = useState('')
  const [manualDept, setManualDept] = useState('')
  const [manualPhoneError, setManualPhoneError] = useState<string | null>(null)
  const [manualLoading, setManualLoading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const t = useT()

  function validateManualPhone() {
    if (manualPhone.trim() && !normalizePhone(manualPhone)) {
      setManualPhoneError(t('Invalid phone number'))
      return false
    }
    setManualPhoneError(null)
    return true
  }

  async function handleManualAdd(e: React.FormEvent) {
    e.preventDefault()
    if (!validateManualPhone()) return
    setManualLoading(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: manualName.trim(), phone_number: manualPhone.trim(), department: manualDept.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setMessage({ text: data.error ?? t('Failed to add employee'), type: 'error' }); return }
      setManualName('')
      setManualPhone('')
      setManualDept('')
      setMessage({ text: t('Employee added'), type: 'success' })
      router.refresh()
    } catch {
      setMessage({ text: t('Network error — please try again'), type: 'error' })
    } finally {
      setManualLoading(false)
    }
  }

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
    setRows([])
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      const raw = parseSheetRows(bytes)
      if (raw.length === 0) {
        setMessage({ text: t('File is empty or has no data rows'), type: 'error' })
        return
      }
      const parsed: ParsedRow[] = raw.map(normalizeCSVRow)
      setRows(validateRows(parsed))
    } catch (err) {
      setMessage({ text: `${t('Failed to read file')}: ${err instanceof Error ? err.message : String(err)}`, type: 'error' })
    }
  }

  const validRows = rows.filter((r) => r._status === 'valid')
  const invalidCount = rows.length - validRows.length

  async function handleUploadConfirm() {
    setUploading(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: validRows.map(({ name, phone_number, department }) => ({ name, phone_number, department })) }),
      })
      const data = await res.json()
      if (!res.ok) { setMessage({ text: data.error ?? 'Upload failed', type: 'error' }); return }
      setMessage({ text: `${data.inserted} ${t('employees uploaded')}`, type: 'success' })
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
      className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${tab === t ? 'bg-white text-zinc-900 shadow-sm' : 'text-zinc-500 hover-brand-text'}`}
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
        {tabBtn('manual', t('Add manually'))}
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
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${isDragging ? 'border-brand bg-brand-soft' : 'border-zinc-200 hover:border-brand hover-brand'}`}
          >
            <svg className="w-8 h-8 text-zinc-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="text-sm text-zinc-500"><span className="font-medium text-brand">{t('Click to browse')}</span> {t('or drag and drop')}</p>
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
              {invalidCount > 0 && (
                <div className="bg-red-50 border border-red-100 rounded-lg p-3 mb-4">
                  <p className="text-xs font-semibold text-red-700 mb-2 uppercase tracking-wide">
                    {t('Invalid rows — fix these in your file and re-upload')}
                  </p>
                  <ul className="space-y-2">
                    {rows
                      .map((row, i) => ({ row, i }))
                      .filter(({ row }) => row._status === 'invalid')
                      .slice(0, 10)
                      .map(({ row, i }) => (
                        <li key={i} className="flex items-center gap-2 text-sm">
                          <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          <span className="text-zinc-400 font-mono text-xs w-12">{t('Row')} {i + 1}</span>
                          <span className={`flex-1 truncate ${row.name?.trim() ? 'text-zinc-700 font-medium' : 'text-zinc-400 italic'}`}>
                            {row.name?.trim() || t('(no name)')}
                          </span>
                          <span className="bg-red-100 text-red-700 text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
                            {t(row._reason ?? '')}
                          </span>
                        </li>
                      ))}
                  </ul>
                  {invalidCount > 10 && (
                    <p className="text-xs text-red-400 mt-2">…{invalidCount - 10} {t('more rows not shown')}</p>
                  )}
                  <p className="text-xs text-red-500 mt-3">
                    {t('These rows were skipped. Only valid rows will be uploaded.')}
                  </p>
                </div>
              )}
              <button onClick={handleUploadConfirm} disabled={validRows.length === 0 || uploading}
                className="w-full bg-brand text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all">
                {uploading ? t('Uploading…') : `${t('Confirm Upload')} (${validRows.length} ${t('employees')})`}
              </button>
            </div>
          )}
        </>
      )}

      {/* Manual add tab */}
      {tab === 'manual' && (
        <form onSubmit={handleManualAdd} className="flex flex-col gap-3 sm:flex-row sm:gap-2 sm:items-end">
          <div className="flex flex-col gap-1 flex-1">
            <label htmlFor="mp-name" className="text-xs font-medium text-zinc-600">{t('Name')}</label>
            <input
              id="mp-name" type="text" required value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              className="h-9 border border-zinc-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 ring-brand focus:border-transparent"
            />
            <p className="h-4" />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label htmlFor="mp-phone" className="text-xs font-medium text-zinc-600">{t('Phone')}</label>
            <input
              id="mp-phone" type="tel" dir="ltr" value={manualPhone}
              onChange={(e) => { setManualPhone(e.target.value); setManualPhoneError(null) }}
              onBlur={validateManualPhone}
              className={`h-9 border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 ring-brand focus:border-transparent ${manualPhoneError ? 'border-red-300' : 'border-zinc-200'}`}
            />
            <p className="text-xs h-4 text-red-500">{manualPhoneError ?? ''}</p>
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label htmlFor="mp-dept" className="text-xs font-medium text-zinc-600">{t('Department')}</label>
            <input
              id="mp-dept" type="text" value={manualDept}
              onChange={(e) => setManualDept(e.target.value)}
              className="h-9 border border-zinc-200 rounded-lg px-3 text-sm focus:outline-none focus:ring-2 ring-brand focus:border-transparent"
            />
            <p className="h-4" />
          </div>
          <div className="flex flex-col gap-1">
            <button
              type="submit"
              disabled={manualLoading || !manualName.trim()}
              className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all whitespace-nowrap w-full sm:w-auto"
            >
              {manualLoading ? t('Adding…') : t('Add employee')}
            </button>
            <p className="h-4" />
          </div>
        </form>
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
                className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-700 focus:outline-none focus:ring-2 ring-brand focus:border-transparent mb-4">
                <option value="">{t('Select a campaign…')}</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.campaign_date ? ` (${c.campaign_date})` : ''}</option>
                ))}
              </select>
              <button onClick={handleClone} disabled={!cloneSource || cloning}
                className="w-full bg-brand text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all">
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
