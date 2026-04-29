'use client'

import { useState } from 'react'
import { normalizePhone } from '@/lib/phone'

type Props = {
  campaignId: string
  onClose: () => void
}

export function AddEmployeeModal({ campaignId, onClose }: Props) {
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [department, setDepartment] = useState('')
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function validatePhone() {
    if (!phone.trim()) { setPhoneError('Phone number is required'); return false }
    if (!normalizePhone(phone)) { setPhoneError('Invalid phone number'); return false }
    setPhoneError(null)
    return true
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validatePhone()) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), phone_number: phone.trim(), department: department.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Failed to add employee'); return }
      onClose()
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl border border-zinc-200 p-6 w-full max-w-sm">
        <h2 className="text-base font-semibold text-zinc-900 mb-4">Add employee</h2>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">
            {error}
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="emp-name" className="text-sm font-medium text-zinc-700">Name</label>
            <input
              id="emp-name"
              type="text"
              placeholder="Sarah Cohen"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="emp-phone" className="text-sm font-medium text-zinc-700">Phone number</label>
            <input
              id="emp-phone"
              type="tel"
              placeholder="+972501234567"
              value={phone}
              onChange={(e) => { setPhone(e.target.value); setPhoneError(null) }}
              onBlur={validatePhone}
              required
              className={`border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                phoneError ? 'border-red-300' : 'border-zinc-200'
              }`}
            />
            {phoneError && <p className="text-xs text-red-500">{phoneError}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="emp-dept" className="text-sm font-medium text-zinc-700">
              Department <span className="text-zinc-400 font-normal">(optional)</span>
            </label>
            <input
              id="emp-dept"
              type="text"
              placeholder="Engineering"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          <div className="flex gap-3 justify-end mt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-zinc-700 border border-zinc-200 rounded-lg hover:bg-zinc-50 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="px-4 py-2 text-sm font-semibold text-white bg-gradient-to-r from-indigo-500 to-violet-500 rounded-lg hover:brightness-110 transition-all disabled:opacity-50"
            >
              {loading ? 'Adding…' : 'Add employee'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
