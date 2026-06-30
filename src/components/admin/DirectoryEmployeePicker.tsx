'use client'

import { useState, useEffect } from 'react'
import { useT } from '@/lib/i18n/useT'

type Employee = { id: string; employee_name: string; phone: string | null; department: string | null; user_id?: string | null }
type ExistingToken = { employee_name: string; phone_number: string | null }

type Props = {
  campaignId: string
  existingTokens?: ExistingToken[]
  onAdded: () => void
}

export function DirectoryEmployeePicker({ campaignId, existingTokens = [], onAdded }: Props) {
  const t = useT()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    fetch('/api/employees').then((r) => r.json()).then((d) => setEmployees(d.employees ?? []))
  }, [])

  const existingSet = new Set(existingTokens.map((t) => `${t.employee_name}|${t.phone_number ?? ''}`))
  const notYetAdded = employees.filter((e) => !existingSet.has(`${e.employee_name}|${e.phone ?? ''}`))

  const departments = [...new Set(notYetAdded.map((e) => e.department).filter(Boolean) as string[])].sort()

  const filtered = notYetAdded.filter((e) => {
    const matchSearch = !search || e.employee_name.toLowerCase().includes(search.toLowerCase())
    const matchDept = !deptFilter || e.department === deptFilter
    return matchSearch && matchDept
  })

  const allFilteredSelected = filtered.length > 0 && filtered.every((e) => selected.has(e.id))

  function toggleAll() {
    if (allFilteredSelected) {
      setSelected((prev) => {
        const next = new Set(prev)
        filtered.forEach((e) => next.delete(e.id))
        return next
      })
    } else {
      setSelected((prev) => {
        const next = new Set(prev)
        filtered.forEach((e) => next.add(e.id))
        return next
      })
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  async function handleAdd() {
    if (selected.size === 0) return
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/tokens`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'directory', employeeIds: [...selected] }),
      })
      const data = await res.json()
      if (!res.ok) { setMessage({ text: data.error ?? t('Failed to add employee'), type: 'error' }); return }
      setMessage({ text: `${data.inserted} ${t('employees added to campaign')}`, type: 'success' })
      setSelected(new Set())
      onAdded()
    } finally {
      setLoading(false)
    }
  }

  if (employees.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-400 text-sm">
        {t('Your directory is empty.')}{' '}
        <a href="/admin/employees" className="text-brand hover:underline">{t('Add employees')}</a> first.
      </div>
    )
  }

  if (notYetAdded.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-400 text-sm">
        {t('All directory employees are already in this campaign.')}
      </div>
    )
  }

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input type="text" placeholder={t('Search…')} value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border border-zinc-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:border-transparent"
          style={{ '--tw-ring-color': 'var(--brand,#6366f1)' } as React.CSSProperties} />
        {departments.length > 0 && (
          <select value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); setSelected(new Set()) }}
            className="border border-zinc-200 rounded-lg px-2 py-1.5 text-sm text-zinc-700 focus:outline-none">
            <option value="">{t('All depts')}</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>

      <div className="flex items-center justify-between mb-2">
        <button onClick={toggleAll} disabled={filtered.length === 0} className="text-xs font-medium disabled:opacity-40" style={{ color: 'var(--brand,#6366f1)' }}>
          {allFilteredSelected
            ? deptFilter ? `${t('Deselect all')} ${deptFilter}` : t('Deselect all')
            : deptFilter ? `${t('Select all')} ${deptFilter}` : t('Select all')}
        </button>
        <span className="text-xs text-zinc-400">{selected.size} {t('selected')}</span>
      </div>

      <div className="border border-zinc-100 rounded-xl overflow-hidden max-h-52 overflow-y-auto mb-3">
        {filtered.map((e) => (
          <label
            key={e.id}
            className="flex items-center gap-3 px-3 py-2 border-b border-zinc-50 last:border-0 hover-brand cursor-pointer"
          >
            <input
              type="checkbox"
              checked={selected.has(e.id)}
              onChange={() => toggle(e.id)}
              className="w-4 h-4 rounded border-zinc-300 ring-brand"
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-800 truncate">{e.employee_name}</p>
              {e.department && <p className="text-xs text-zinc-400">{e.department}</p>}
            </div>
            {!e.phone && (
              <span className="text-xs text-zinc-400 font-medium flex-shrink-0">{t('QR only')}</span>
            )}
          </label>
        ))}
      </div>

      {message && (
        <p className={`text-sm mb-3 ${message.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>
      )}

      <button
        onClick={handleAdd}
        disabled={selected.size === 0 || loading}
        className="w-full text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all"
        style={{ backgroundColor: 'var(--brand,#6366f1)' }}
      >
        {loading ? t('Adding…') : `${t('Add')} ${selected.size > 0 ? selected.size : ''} ${t('employees')}`}
      </button>
    </div>
  )
}
