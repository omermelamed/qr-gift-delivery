'use client'

import { useState, useEffect, useRef } from 'react'
import type { GiftOption } from '@/types'

type Props = { campaignId: string; disabled?: boolean }

export function GiftOptionsEditor({ campaignId, disabled = false }: Props) {
  const [gifts, setGifts] = useState<GiftOption[]>([])
  const [newName, setNewName] = useState('')
  const [loading, setLoading] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch(`/api/campaigns/${campaignId}/gifts`)
      .then((r) => r.json())
      .then((d) => setGifts(d.gifts ?? []))
  }, [campaignId])

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setLoading(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/gifts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      if (res.ok) {
        const gift = await res.json()
        setGifts((prev) => [...prev, gift])
        setNewName('')
        inputRef.current?.focus()
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    await fetch(`/api/campaigns/${campaignId}/gifts/${id}`, { method: 'DELETE' })
    setGifts((prev) => prev.filter((g) => g.id !== id))
  }

  async function handleSaveEdit(id: string) {
    const name = editName.trim()
    if (!name) return
    await fetch(`/api/campaigns/${campaignId}/gifts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    })
    setGifts((prev) => prev.map((g) => g.id === id ? { ...g, name } : g))
    setEditingId(null)
  }

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5">
      <h2 className="font-semibold text-zinc-900 mb-1">Gift Options</h2>
      <p className="text-xs text-zinc-400 mb-4">
        {gifts.length === 0
          ? 'No options — campaign will use single-gift flow'
          : `${gifts.length} option${gifts.length !== 1 ? 's' : ''} defined`}
      </p>

      {gifts.length > 0 && (
        <ul className="flex flex-col gap-2 mb-4">
          {gifts.map((g, i) => (
            <li key={g.id} className="flex items-center gap-2">
              <span
                className="w-5 h-5 rounded-full text-white text-xs flex items-center justify-center flex-shrink-0 font-bold"
                style={{ backgroundColor: GIFT_COLORS[i % GIFT_COLORS.length] }}
              >
                {i + 1}
              </span>
              {editingId === g.id ? (
                <>
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit(g.id)
                      if (e.key === 'Escape') setEditingId(null)
                    }}
                    className="flex-1 border border-zinc-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button onClick={() => handleSaveEdit(g.id)} className="text-xs font-medium" style={{ color: 'var(--brand,#6366f1)' }}>Save</button>
                  <button onClick={() => setEditingId(null)} className="text-xs text-zinc-400">Cancel</button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm text-zinc-800">{g.name}</span>
                  {!disabled && (
                    <>
                      <button
                        onClick={() => { setEditingId(g.id); setEditName(g.name) }}
                        className="text-zinc-400 hover:text-zinc-700 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(g.id)}
                        className="text-zinc-400 hover:text-red-500 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && (
        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            placeholder="e.g. Spa Voucher"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="flex-1 border border-zinc-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <button
            type="submit"
            disabled={loading || !newName.trim()}
            className="text-white rounded-lg px-3 py-1.5 text-sm font-medium disabled:opacity-50 hover:brightness-110 transition-all"
            style={{ backgroundColor: 'var(--brand,#6366f1)' }}
          >
            Add
          </button>
        </form>
      )}
    </div>
  )
}

export const GIFT_COLORS = ['#6366f1', '#8b5cf6', '#f59e0b', '#14b8a6', '#f43f5e', '#f97316']
