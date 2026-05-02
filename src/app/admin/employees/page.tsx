'use client'

import { useState, useEffect } from 'react'
import { AddDirectoryEmployeeModal } from '@/components/admin/AddDirectoryEmployeeModal'
import { ImportDirectoryModal } from '@/components/admin/ImportDirectoryModal'
import { ConfirmModal } from '@/components/ui/ConfirmModal'

type Employee = { id: string; employee_name: string; phone: string | null; department: string | null; user_id?: string | null }

function maskPhone(phone: string | null) {
  if (!phone) return null
  return phone.replace(/\d(?=\d{4})/g, '•')
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [search, setSearch] = useState('')
  const [deptFilter, setDeptFilter] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editDept, setEditDept] = useState('')
  const [removeTarget, setRemoveTarget] = useState<Employee | null>(null)
  const [removeLoading, setRemoveLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/employees').then((r) => r.json()).then((d) => setEmployees(d.employees ?? []))
  }, [])

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  const departments = [...new Set(employees.map((e) => e.department).filter(Boolean) as string[])].sort()

  const filtered = employees.filter((e) => {
    const matchSearch = !search ||
      e.employee_name.toLowerCase().includes(search.toLowerCase()) ||
      (e.department ?? '').toLowerCase().includes(search.toLowerCase())
    const matchDept = !deptFilter || e.department === deptFilter
    return matchSearch && matchDept
  })

  async function handleRemove() {
    if (!removeTarget) return
    setRemoveLoading(true)
    await fetch(`/api/employees/${removeTarget.id}`, { method: 'DELETE' })
    setEmployees((prev) => prev.filter((e) => e.id !== removeTarget.id))
    setRemoveTarget(null)
    setRemoveLoading(false)
    showToast('Employee removed')
  }

  async function handleSaveEdit(id: string) {
    const res = await fetch(`/api/employees/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ employee_name: editName, phone: editPhone || null, department: editDept || null }),
    })
    if (res.ok) {
      setEmployees((prev) => prev.map((e) => e.id === id
        ? { ...e, employee_name: editName, phone: editPhone || null, department: editDept || null }
        : e
      ))
      setEditingId(null)
      showToast('Employee updated')
    }
  }

  function startEdit(e: Employee) {
    setEditingId(e.id)
    setEditName(e.employee_name)
    setEditPhone(e.phone ?? '')
    setEditDept(e.department ?? '')
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Employee Directory</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{employees.length} employee{employees.length !== 1 ? 's' : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowImport(true)} className="border border-zinc-200 rounded-lg px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
            Import CSV
          </button>
          <button onClick={() => setShowAdd(true)} className="text-white rounded-lg px-4 py-2 text-sm font-semibold hover:brightness-110 transition-all" style={{ backgroundColor: 'var(--brand,#6366f1)' }}>
            + Add employee
          </button>
        </div>
      </div>

      <div className="flex gap-3 mb-4">
        <input type="text" placeholder="Search by name or department…" value={search} onChange={(e) => setSearch(e.target.value)}
          className="flex-1 border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent" />
        {departments.length > 0 && (
          <select value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} className="border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-700 focus:outline-none">
            <option value="">All departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-zinc-400 text-sm">
            {employees.length === 0 ? 'No employees yet. Add one or import from CSV.' : 'No employees match your search.'}
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-zinc-400 border-b border-zinc-100">
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">Phone</th>
                <th className="px-5 py-3 font-medium">Department</th>
                <th className="px-5 py-3 font-medium w-24" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => (
                <tr key={e.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                  {editingId === e.id ? (
                    <>
                      <td className="px-5 py-2">
                        <input value={editName} onChange={(ev) => setEditName(ev.target.value)}
                          className="border border-zinc-200 rounded-lg px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </td>
                      <td className="px-5 py-2">
                        <input value={editPhone} onChange={(ev) => setEditPhone(ev.target.value)}
                          placeholder="+1234567890"
                          className="border border-zinc-200 rounded-lg px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono" />
                      </td>
                      <td className="px-5 py-2">
                        <input value={editDept} onChange={(ev) => setEditDept(ev.target.value)} placeholder="Department"
                          className="border border-zinc-200 rounded-lg px-2 py-1 text-sm w-full focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                      </td>
                      <td className="px-5 py-2 text-right">
                        <div className="flex justify-end gap-2">
                          <button onClick={() => handleSaveEdit(e.id)} className="text-xs font-medium" style={{ color: 'var(--brand,#6366f1)' }}>Save</button>
                          <button onClick={() => setEditingId(null)} className="text-xs font-medium text-zinc-400 hover:text-zinc-600">Cancel</button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-5 py-3 font-medium text-zinc-900">{e.employee_name}</td>
                      <td className="px-5 py-3 font-mono text-xs text-zinc-500">
                        {e.phone
                          ? maskPhone(e.phone)
                          : <button onClick={() => startEdit(e)} className="text-xs text-amber-500 hover:text-amber-600 font-medium">+ Add phone</button>
                        }
                      </td>
                      <td className="px-5 py-3 text-zinc-500">{e.department ?? <span className="text-zinc-300">—</span>}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-3">
                          <button onClick={() => startEdit(e)} className="text-zinc-400 hover:text-zinc-700 transition-colors">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          {e.user_id ? (
                            <span title="Remove from Team to delete" className="text-zinc-200 cursor-not-allowed">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </span>
                          ) : (
                            <button onClick={() => setRemoveTarget(e)} className="text-zinc-400 hover:text-red-500 transition-colors">
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-zinc-900 text-white text-sm px-4 py-2 rounded-full shadow-lg">
          {toast}
        </div>
      )}

      {showAdd && (
        <AddDirectoryEmployeeModal
          onClose={() => setShowAdd(false)}
          onAdded={(emp) => { setEmployees((prev) => [...prev, emp].sort((a, b) => a.employee_name.localeCompare(b.employee_name))); showToast('Employee added') }}
        />
      )}

      {showImport && (
        <ImportDirectoryModal
          onClose={() => setShowImport(false)}
          onImported={(count) => {
            showToast(`${count} employees imported`)
            fetch('/api/employees').then((r) => r.json()).then((d) => setEmployees(d.employees ?? []))
          }}
        />
      )}

      {removeTarget && (
        <ConfirmModal
          title={`Remove ${removeTarget.employee_name}?`}
          message="This removes them from the directory only. Existing campaign tokens are not affected."
          confirmLabel="Remove"
          loading={removeLoading}
          onConfirm={handleRemove}
          onCancel={() => setRemoveTarget(null)}
        />
      )}
    </div>
  )
}
