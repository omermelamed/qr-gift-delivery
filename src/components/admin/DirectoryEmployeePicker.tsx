'use client'

import { useState, useEffect } from 'react'

type Employee = { id: string; employee_name: string; phone: string; department: string | null }

type Props = {
  campaignId: string
  onAdded: () => void
}

export function DirectoryEmployeePicker({ campaignId, onAdded }: Props) {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    fetch('/api/employees').then((r) => r.json()).then((d) => setEmployees(d.employees ?? []))
  }, [])

  const departments = [...new Set(employees.map((e) => e.department).filter(Boolean) as string[])].sort()

  const filtered = employees.filter((e) => {
    const matchSearch = !search || e.employee_name.toLowerCase().includes(search.toLowerCase())
    const matchDept = !deptFilter || e.department === deptFilter
    return matchSearch && matchDept
  })

  function toggleAll() {
    if (selected.size === filtered.length && filtered.length > 0) {
      setSelected(new Set())
    } else {
      setSelected(new Set(filtered.map((e) => e.id)))
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
      if (!res.ok) { setMessage({ text: data.error ?? 'Failed to add employees', type: 'error' }); return }
      setMessage({ text: `${data.inserted} employees added to campaign`, type: 'success' })
      setSelected(new Set())
      onAdded()
    } finally {
      setLoading(false)
    }
  }

  if (employees.length === 0) {
    return (
      <div className="text-center py-8 text-zinc-400 text-sm">
        Your directory is empty.{' '}
        <a href="/admin/employees" className="text-indigo-600 hover:underline">Add employees</a> first.
      </div>
    )
  }

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <input type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border border-zinc-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
        {departments.length > 0 && (
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)}
            className="border border-zinc-200 rounded-lg px-2 py-1.5 text-sm text-zinc-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent">
            <option value="">All depts</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>

      <div className="flex items-center justify-between mb-2">
        <button onClick={toggleAll} className="text-xs text-indigo-600 hover:text-indigo-700 font-medium">
          {selected.size === filtered.length && filtered.length > 0 ? 'Deselect all' : 'Select all'}
        </button>
        <span className="text-xs text-zinc-400">{selected.size} selected</span>
      </div>

      <div className="border border-zinc-100 rounded-xl overflow-hidden max-h-52 overflow-y-auto mb-3">
        {filtered.map((e) => (
          <label key={e.id} className="flex items-center gap-3 px-3 py-2 hover:bg-zinc-50 cursor-pointer border-b border-zinc-50 last:border-0">
            <input type="checkbox" checked={selected.has(e.id)} onChange={() => toggle(e.id)}
              className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-zinc-800 truncate">{e.employee_name}</p>
              {e.department && <p className="text-xs text-zinc-400">{e.department}</p>}
            </div>
          </label>
        ))}
      </div>

      {message && (
        <p className={`text-sm mb-3 ${message.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>{message.text}</p>
      )}

      <button onClick={handleAdd} disabled={selected.size === 0 || loading}
        className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all">
        {loading ? 'Adding…' : `Add ${selected.size > 0 ? selected.size : ''} to campaign`}
      </button>
    </div>
  )
}
