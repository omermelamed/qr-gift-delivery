'use client'

import { useState } from 'react'
import { normalizePhone } from '@/lib/phone'

type Employee = { id: string; employee_name: string; phone: string; department: string | null }

type Props = {
  onClose: () => void
  onAdded: (employee: Employee) => void
}

export function AddDirectoryEmployeeModal({ onClose, onAdded }: Props) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [department, setDepartment] = useState('')
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function handlePhoneBlur() {
    const normalized = normalizePhone(phone)
    if (phone && !normalized) setPhoneError('Invalid phone number')
    else { setPhoneError(null); if (normalized) setPhone(normalized) }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const normalized = normalizePhone(phone)
    if (!normalized) { setPhoneError('Invalid phone number'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/employees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_name: name, phone: normalized, department: department || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to add employee'); return }
      onAdded({ id: data.id, employee_name: name, phone: normalized, department: department || null })
      onClose()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <h2 className="text-lg font-semibold text-zinc-900 mb-5">Add employee</h2>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">{error}</p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required
              className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700">Phone</label>
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={handlePhoneBlur} required
              className={`border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${phoneError ? 'border-red-300' : 'border-zinc-200'}`} />
            {phoneError && <p className="text-xs text-red-500">{phoneError}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700">Department <span className="text-zinc-400">(optional)</span></label>
            <input type="text" value={department} onChange={(e) => setDepartment(e.target.value)}
              className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent" />
          </div>
          <div className="flex gap-3 mt-2">
            <button type="button" onClick={onClose} className="flex-1 border border-zinc-200 rounded-lg px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="flex-1 bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all">
              {loading ? 'Adding…' : 'Add employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
