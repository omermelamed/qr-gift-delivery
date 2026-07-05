'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/useT'

const AVAILABLE_VARIABLES = [
  { key: 'name', label: 'Name', example: 'David Cohen' },
  { key: 'date', label: 'Date', example: '25/06/2026' },
  { key: 'address', label: 'Address', example: 'Rothschild 22, Tel Aviv' },
  { key: 'link', label: 'Link', example: 'https://example.com/rsvp/abc' },
] as const

type Props = {
  mode: 'create' | 'edit'
  templateId?: string
  initialName?: string
  initialBody?: string
}

export function TemplateEditor({ mode, templateId, initialName = '', initialBody = '' }: Props) {
  const t = useT()
  const router = useRouter()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [name, setName] = useState(initialName)
  const [body, setBody] = useState(initialBody)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function insertVariable(varKey: string) {
    const textarea = textareaRef.current
    if (!textarea) return

    const tag = `{{${varKey}}}`
    const start = textarea.selectionStart
    const end = textarea.selectionEnd
    const newBody = body.slice(0, start) + tag + body.slice(end)
    setBody(newBody)

    requestAnimationFrame(() => {
      textarea.focus()
      const pos = start + tag.length
      textarea.setSelectionRange(pos, pos)
    })
  }

  function getPreview(): string {
    let preview = body
    for (const v of AVAILABLE_VARIABLES) {
      preview = preview.replaceAll(`{{${v.key}}}`, v.example)
    }
    return preview
  }

  async function handleSave() {
    if (!name.trim() || !body.trim()) return
    setSaving(true)
    setError(null)

    const url = mode === 'edit' ? `/api/sms/templates/${templateId}` : '/api/sms/templates'
    const method = mode === 'edit' ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), bodyTemplate: body.trim() }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? t('Something went wrong'))
      setSaving(false)
      return
    }

    router.push('/admin/sms/templates')
    router.refresh()
  }

  const charCount = body.length
  const smsSegments = charCount === 0 ? 0 : Math.ceil(charCount / 160)

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Editor */}
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">{t('Template Name')}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Event Invitation"
            className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:ring-2 ring-brand focus:border-brand outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 mb-1">{t('Message Body')}</label>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {AVAILABLE_VARIABLES.map((v) => (
              <button
                key={v.key}
                type="button"
                onClick={() => insertVariable(v.key)}
                className="text-xs px-2.5 py-1 rounded-full border border-zinc-200 text-zinc-600 hover-brand hover:border-brand hover-brand-text transition-colors"
              >
                {`{{${v.key}}}`}
              </button>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={6}
            placeholder="Hi {{name}}, you're invited to our event on {{date}}! RSVP here: {{link}}"
            className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm font-mono focus:ring-2 ring-brand focus:border-brand outline-none resize-y"
          />
          <div className="flex justify-between text-xs text-zinc-400 mt-1">
            <span>{charCount} {t('characters')}</span>
            <span>{smsSegments} {smsSegments === 1 ? t('SMS segment') : t('SMS segments')}</span>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex gap-3">
          <button
            onClick={() => router.back()}
            className="px-4 py-2.5 rounded-lg border border-zinc-200 text-zinc-600 font-medium hover-brand transition-colors"
          >
            {t('Cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || !body.trim() || saving}
            className="px-6 py-2.5 rounded-lg text-white font-semibold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ backgroundColor: 'var(--brand, #6E8B74)' }}
          >
            {saving ? t('Saving…') : mode === 'edit' ? t('Update Template') : t('Create Template')}
          </button>
        </div>
      </div>

      {/* Live preview */}
      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1">{t('Preview')}</label>
        <div className="bg-zinc-900 rounded-2xl p-6 min-h-[200px]">
          <div className="bg-emerald-600 rounded-xl rounded-bl-sm px-4 py-3 max-w-[85%]">
            <p className="text-white text-sm whitespace-pre-wrap">
              {getPreview() || t('Your message will appear here...')}
            </p>
          </div>
          {body && (
            <p className="text-zinc-500 text-xs mt-2 px-1">
              {smsSegments} {smsSegments === 1 ? t('segment') : t('segments')} · ₪{smsSegments} {t('per recipient')}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
