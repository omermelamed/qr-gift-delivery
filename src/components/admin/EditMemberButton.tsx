'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const ROLE_OPTIONS = [
  { value: 'company_admin', label: 'Admin' },
  { value: 'campaign_manager', label: 'Campaign Manager' },
  { value: 'scanner', label: 'Scanner' },
]

type Props = {
  userId: string
  name: string
  email: string
  roleName: string
  isActive: boolean
  isPending: boolean
  isSelf: boolean
}

export function EditMemberButton({ userId, name, email, roleName, isActive, isPending, isSelf }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [emailAction, setEmailAction] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const [form, setForm] = useState({ name, email, role_name: roleName, active: isActive })

  function resetAndClose() {
    setOpen(false)
    setError(null)
    setEmailAction('idle')
    setForm({ name, email, role_name: roleName, active: isActive })
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/team/members/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Save failed')
        return
      }
      resetAndClose()
      router.refresh()
    } catch {
      setError('Network error — please try again')
    } finally {
      setSaving(false)
    }
  }

  async function sendEmail(action: 'reset' | 'reinvite') {
    setEmailAction('loading')
    try {
      const endpoint = action === 'reset' ? '/api/team/reset-password' : '/api/team/resend'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      setEmailAction(res.ok ? 'done' : 'error')
      setTimeout(() => setEmailAction('idle'), 3000)
    } catch {
      setEmailAction('error')
      setTimeout(() => setEmailAction('idle'), 3000)
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="border border-zinc-200 rounded-lg px-3 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
      >
        Edit
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={resetAndClose}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <div className="px-6 pt-6 pb-4 border-b border-zinc-100">
              <h2 className="text-lg font-semibold text-zinc-900">Edit member</h2>
            </div>

            <div className="p-6 flex flex-col gap-4">
              {/* Name */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-zinc-700">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--brand]"
                />
              </div>

              {/* Email */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-zinc-700">Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--brand]"
                />
              </div>

              {/* Role — disabled for self */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-zinc-700">
                  Role {isSelf && <span className="text-xs text-zinc-400 font-normal">(cannot change own role)</span>}
                </label>
                <select
                  value={form.role_name}
                  onChange={(e) => setForm((f) => ({ ...f, role_name: e.target.value }))}
                  disabled={isSelf}
                  className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[--brand] disabled:bg-zinc-50 disabled:text-zinc-400"
                >
                  {ROLE_OPTIONS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              {/* Status — disabled for self */}
              {!isSelf && (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-zinc-700">Status</p>
                    <p className="text-xs text-zinc-400">Deactivated users cannot log in</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, active: !f.active }))}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      form.active ? 'bg-green-500' : 'bg-zinc-300'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                      form.active ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
              )}

              {/* Email actions */}
              <div className="flex gap-2 pt-1 border-t border-zinc-100">
                {isPending && (
                  <button
                    type="button"
                    onClick={() => sendEmail('reinvite')}
                    disabled={emailAction === 'loading'}
                    className="text-xs border border-zinc-200 rounded-lg px-3 py-1.5 text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
                  >
                    {emailAction === 'done' ? '✓ Invite sent' : emailAction === 'error' ? 'Failed' : emailAction === 'loading' ? 'Sending…' : 'Resend invite'}
                  </button>
                )}
                {!isPending && (
                  <button
                    type="button"
                    onClick={() => sendEmail('reset')}
                    disabled={emailAction === 'loading'}
                    className="text-xs border border-zinc-200 rounded-lg px-3 py-1.5 text-zinc-600 hover:bg-zinc-50 disabled:opacity-50 transition-colors"
                  >
                    {emailAction === 'done' ? '✓ Email sent' : emailAction === 'error' ? 'Failed' : emailAction === 'loading' ? 'Sending…' : 'Send password reset'}
                  </button>
                )}
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            <div className="px-6 pb-6 flex justify-end gap-3">
              <button
                onClick={resetAndClose}
                className="border border-zinc-200 rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.name.trim() || !form.email.trim()}
                className="text-white rounded-lg px-4 py-2 text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50"
                style={{ backgroundColor: 'var(--brand,#6366f1)' }}
              >
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
