'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/browser'
import { useT } from '@/lib/i18n/useT'
import { PencilIcon, TrashIcon } from '@/components/icons'

type Note = {
  id: string
  author_id: string
  author_name: string
  body: string
  created_at: string
  updated_at: string
}

function timeAgo(iso: string, t: (k: string) => string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return t('just now')
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function CampaignNotes({
  campaignId,
  currentUserId,
}: {
  campaignId: string
  currentUserId: string
}) {
  const t = useT()
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [draft, setDraft] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editBody, setEditBody] = useState('')
  const [query, setQuery] = useState('')

  const q = query.trim().toLowerCase()
  const filtered = q
    ? notes.filter((n) => n.body.toLowerCase().includes(q) || n.author_name.toLowerCase().includes(q))
    : notes

  useEffect(() => {
    fetch(`/api/campaigns/${campaignId}/notes`)
      .then((r) => r.json())
      .then(({ notes: n }) => { setNotes(n ?? []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [campaignId])

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`campaign-notes-${campaignId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'campaign_notes', filter: `campaign_id=eq.${campaignId}` }, (payload) => {
        setNotes((prev) => prev.some((n) => n.id === payload.new.id) ? prev : [...prev, payload.new as Note])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'campaign_notes', filter: `campaign_id=eq.${campaignId}` }, (payload) => {
        setNotes((prev) => prev.map((n) => n.id === payload.new.id ? { ...n, ...payload.new as Note } : n))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'campaign_notes', filter: `campaign_id=eq.${campaignId}` }, (payload) => {
        setNotes((prev) => prev.filter((n) => n.id !== payload.old.id))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [campaignId])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      })
      if (res.ok) {
        const { note } = await res.json()
        setNotes((prev) => prev.some((n) => n.id === note.id) ? prev : [...prev, note])
        setDraft('')
      }
    } finally {
      setSubmitting(false)
    }
  }

  async function handleEdit(noteId: string) {
    const text = editBody.trim()
    if (!text) return
    const res = await fetch(`/api/campaigns/${campaignId}/notes/${noteId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: text }),
    })
    if (res.ok) {
      const { note } = await res.json()
      setNotes((prev) => prev.map((n) => n.id === noteId ? note : n))
      setEditingId(null)
    }
  }

  async function handleDelete(noteId: string) {
    await fetch(`/api/campaigns/${campaignId}/notes/${noteId}`, { method: 'DELETE' })
    setNotes((prev) => prev.filter((n) => n.id !== noteId))
  }

  return (
    <div className="bg-white border border-zinc-200 rounded-xl flex flex-col h-full">
      <div className="px-4 py-3 border-b border-zinc-100 flex flex-col gap-2">
        <h3 className="text-sm font-semibold text-zinc-900">{t('Notes')}</h3>
        {!loading && notes.length > 0 && (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('Search notes…')}
            className="border border-zinc-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 w-full"
          />
        )}
      </div>

      <div className="flex flex-col gap-3 p-4 max-h-[200px] overflow-y-scroll">
        {loading ? (
          <p className="text-xs text-zinc-400 text-center py-4">{t('Loading…')}</p>
        ) : notes.length === 0 ? (
          <p className="text-xs text-zinc-400 text-center py-4">{t('No notes yet. Be the first to add one.')}</p>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-zinc-400 text-center py-4">{t('No matching notes.')}</p>
        ) : (
          filtered.map((note) => (
            <div key={note.id} className="group flex items-center justify-between gap-2">
              <div className="flex flex-col gap-1 min-w-0 flex-1">
                <span className="text-xs font-bold text-zinc-800">{note.author_name}</span>

                {editingId === note.id ? (
                  <div className="flex flex-col gap-1.5">
                    <textarea
                      value={editBody}
                      onChange={(e) => setEditBody(e.target.value)}
                      rows={2}
                      autoFocus
                      className="border border-zinc-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 resize-none w-full"
                    />
                    <div className="flex gap-1.5">
                      <button onClick={() => handleEdit(note.id)} className="text-xs text-white px-2 py-1 rounded" style={{ backgroundColor: 'var(--brand,#6366f1)' }}>{t('Save')}</button>
                      <button onClick={() => setEditingId(null)} className="text-xs text-zinc-500 px-2 py-1 rounded hover-brand">{t('Cancel')}</button>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="text-xs text-zinc-700 whitespace-pre-wrap break-words">{note.body}</p>
                    <span className="block text-xs text-zinc-400 mt-0.5">{timeAgo(note.created_at, t)}{note.updated_at !== note.created_at ? ` · ${t('edited')}` : ''}</span>
                  </div>
                )}
              </div>

              {note.author_id === currentUserId && editingId !== note.id && (
                <div className="flex gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => { setEditingId(note.id); setEditBody(note.body) }} aria-label={t('Edit')} title={t('Edit')} className="text-zinc-400 hover-brand-text transition-colors">
                    <PencilIcon className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(note.id)} aria-label={t('Delete')} title={t('Delete')} className="text-zinc-400 hover:text-red-500 transition-colors">
                    <TrashIcon className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 p-3 border-t border-zinc-100">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('Add a note…')}
          className="flex-1 border border-zinc-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 min-w-0"
        />
        <button
          type="submit"
          disabled={submitting || !draft.trim()}
          className="text-white text-xs font-medium px-3 py-1.5 rounded-lg disabled:opacity-40 flex-shrink-0"
          style={{ backgroundColor: 'var(--brand,#6366f1)' }}
        >
          {t('Post')}
        </button>
      </form>
    </div>
  )
}
