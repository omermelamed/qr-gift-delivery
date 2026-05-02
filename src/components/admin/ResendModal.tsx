'use client'

import { useState, useMemo } from 'react'

type TokenSlice = {
  id: string
  employee_name: string
  department: string | null
  redeemed: boolean
  sms_sent_at: string | null
}

type Mode = 'unclaimed' | 'department' | 'manual'

type Props = {
  campaignId: string
  tokens: TokenSlice[]
  onClose: () => void
  onDone: (dispatched: number, failed: number) => void
}

export function ResendModal({ campaignId, tokens, onClose, onDone }: Props) {
  const [mode, setMode] = useState<Mode>('unclaimed')
  const [selectedDept, setSelectedDept] = useState('')
  const [manualSelected, setManualSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const unredeemed = useMemo(() => tokens.filter((t) => !t.redeemed), [tokens])
  const departments = useMemo(
    () => [...new Set(unredeemed.map((t) => t.department).filter(Boolean) as string[])].sort(),
    [unredeemed]
  )

  const selectedIds = useMemo(() => {
    if (mode === 'unclaimed') return unredeemed.map((t) => t.id)
    if (mode === 'department') return unredeemed.filter((t) => t.department === selectedDept).map((t) => t.id)
    return [...manualSelected]
  }, [mode, unredeemed, selectedDept, manualSelected])

  function toggleManual(id: string) {
    setManualSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function toggleAll() {
    if (manualSelected.size === unredeemed.length) {
      setManualSelected(new Set())
    } else {
      setManualSelected(new Set(unredeemed.map((t) => t.id)))
    }
  }

  async function handleSend() {
    if (selectedIds.length === 0) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/resend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenIds: selectedIds }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error ?? 'Resend failed'); return }
      onDone(data.dispatched ?? 0, data.failed ?? 0)
    } catch {
      setError('Network error — please try again')
    } finally {
      setLoading(false)
    }
  }

  const tabClass = (m: Mode) =>
    `px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
      mode === m
        ? 'text-white'
        : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100'
    }`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-zinc-100 flex-shrink-0">
          <h2 className="text-base font-semibold text-zinc-900 mb-3">Resend SMS</h2>
          {/* Mode tabs */}
          <div className="flex gap-1 bg-zinc-100 p-1 rounded-xl">
            {([
              ['unclaimed', 'Not claimed yet'],
              ['department', 'By department'],
              ['manual', 'Manual selection'],
            ] as [Mode, string][]).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={tabClass(m)}
                style={mode === m ? { backgroundColor: 'var(--brand, #6366f1)' } : undefined}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-0">
          {mode === 'unclaimed' && (
            <div className="text-sm text-zinc-600">
              {unredeemed.length === 0
                ? 'All employees have already claimed their gift.'
                : <>Will resend to <span className="font-semibold text-zinc-900">{unredeemed.length} employee{unredeemed.length !== 1 ? 's' : ''}</span> who haven't claimed their gift yet.</>
              }
            </div>
          )}

          {mode === 'department' && (
            <div className="flex flex-col gap-3">
              {departments.length === 0 ? (
                <p className="text-sm text-zinc-500">No department data available.</p>
              ) : (
                <>
                  <select
                    value={selectedDept}
                    onChange={(e) => setSelectedDept(e.target.value)}
                    className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select a department…</option>
                    {departments.map((d) => {
                      const count = unredeemed.filter((t) => t.department === d).length
                      return <option key={d} value={d}>{d} ({count} unredeemed)</option>
                    })}
                  </select>
                  {selectedDept && (
                    <p className="text-sm text-zinc-600">
                      Will resend to <span className="font-semibold text-zinc-900">{selectedIds.length} employee{selectedIds.length !== 1 ? 's' : ''}</span> in <span className="font-semibold text-zinc-900">{selectedDept}</span>.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {mode === 'manual' && (
            <div className="flex flex-col gap-1">
              {unredeemed.length === 0 ? (
                <p className="text-sm text-zinc-500">All employees have already claimed their gift.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-zinc-400">{manualSelected.size} selected</span>
                    <button onClick={toggleAll} className="text-xs font-medium" style={{ color: 'var(--brand, #6366f1)' }}>
                      {manualSelected.size === unredeemed.length ? 'Deselect all' : 'Select all'}
                    </button>
                  </div>
                  {unredeemed.map((t) => (
                    <label key={t.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-zinc-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={manualSelected.has(t.id)}
                        onChange={() => toggleManual(t.id)}
                        className="w-4 h-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-zinc-800 truncate">{t.employee_name}</p>
                        {t.department && <p className="text-xs text-zinc-400">{t.department}</p>}
                      </div>
                      {!t.sms_sent_at && (
                        <span className="ml-auto flex-shrink-0 text-xs text-amber-500 font-medium">Not sent</span>
                      )}
                    </label>
                  ))}
                </>
              )}
            </div>
          )}

          {error && <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-100 flex gap-3 flex-shrink-0">
          <button onClick={onClose} disabled={loading} className="flex-1 border border-zinc-200 rounded-lg px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={loading || selectedIds.length === 0}
            className="flex-1 text-white rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all"
            style={{ backgroundColor: 'var(--brand, #6366f1)' }}
          >
            {loading ? 'Sending…' : `Send to ${selectedIds.length}`}
          </button>
        </div>
      </div>
    </div>
  )
}
