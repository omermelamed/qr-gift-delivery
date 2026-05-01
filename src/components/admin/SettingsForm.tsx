'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LogoUploader } from '@/components/admin/LogoUploader'

const DEFAULT_TEMPLATE = "Hi {name}! Here's your QR code for your holiday gift. Scan to redeem: {link}"
const MAX_SMS_CHARS = 160
const DEFAULT_BRAND = '#6366f1'

const PRESETS = [
  { color: '#6366f1', label: 'Indigo' },
  { color: '#3b82f6', label: 'Blue' },
  { color: '#0ea5e9', label: 'Sky' },
  { color: '#10b981', label: 'Emerald' },
  { color: '#8b5cf6', label: 'Violet' },
  { color: '#ec4899', label: 'Pink' },
  { color: '#f97316', label: 'Orange' },
  { color: '#ef4444', label: 'Red' },
  { color: '#1f2937', label: 'Charcoal' },
]

type Props = {
  companyId: string
  initialName: string
  initialLogoUrl: string | null
  initialTemplate: string | null
  initialThemeColor: string | null
}

export function SettingsForm({ companyId, initialName, initialLogoUrl, initialTemplate, initialThemeColor }: Props) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [logoUrl, setLogoUrl] = useState<string | null>(initialLogoUrl)
  const [template, setTemplate] = useState(initialTemplate ?? DEFAULT_TEMPLATE)
  const [themeColor, setThemeColor] = useState(initialThemeColor ?? DEFAULT_BRAND)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)

  const templateError = template && !template.includes('{link}') ? 'Template must contain {link}' : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (templateError || !name.trim()) return
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), logo_url: logoUrl, sms_template: template, theme_color: themeColor }),
      })
      const data = await res.json()
      if (!res.ok) { setMessage({ text: data.error ?? 'Save failed', type: 'error' }); return }
      setMessage({ text: 'Settings saved', type: 'success' })
      // Refresh server components so sidebar logo + brand color update immediately
      router.refresh()
    } catch {
      setMessage({ text: 'Network error — please try again', type: 'error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-zinc-200 divide-y divide-zinc-100">
      {/* Company identity */}
      <div className="p-6 flex flex-col gap-5">
        <h2 className="font-semibold text-zinc-900">Company identity</h2>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="co-name" className="text-sm font-medium text-zinc-700">Company name</label>
          <input
            id="co-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent max-w-sm"
            style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-zinc-700">Logo</label>
          <LogoUploader companyId={companyId} currentUrl={logoUrl} onUploaded={(url) => { setLogoUrl(url); router.refresh() }} />
        </div>

        {/* Brand color */}
        <div className="flex flex-col gap-3">
          <label className="text-sm font-medium text-zinc-700">Brand color</label>
          <div className="flex items-center gap-2 flex-wrap">
            {PRESETS.map((p) => (
              <button
                key={p.color}
                type="button"
                title={p.label}
                onClick={() => setThemeColor(p.color)}
                className="w-8 h-8 rounded-full transition-transform hover:scale-110 focus:outline-none"
                style={{ backgroundColor: p.color, boxShadow: themeColor === p.color ? `0 0 0 2px white, 0 0 0 4px ${p.color}` : undefined }}
              />
            ))}
            <label className="relative w-8 h-8 rounded-full overflow-hidden cursor-pointer border-2 border-dashed border-zinc-300 hover:border-zinc-400 transition-colors flex items-center justify-center" title="Custom color">
              <span className="text-zinc-400 text-xs">+</span>
              <input
                type="color"
                value={themeColor}
                onChange={(e) => setThemeColor(e.target.value)}
                className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 rounded" style={{ backgroundColor: themeColor }} />
            <span className="text-xs text-zinc-500 font-mono">{themeColor}</span>
          </div>
        </div>
      </div>

      {/* SMS template */}
      <div className="p-6 flex flex-col gap-3">
        <h2 className="font-semibold text-zinc-900">SMS template</h2>
        <p className="text-sm text-zinc-500">
          Use <code className="font-mono bg-zinc-100 px-1 rounded text-xs">{'{name}'}</code> for the employee&apos;s name
          and <code className="font-mono bg-zinc-100 px-1 rounded text-xs">{'{link}'}</code> for their QR code link (required).
        </p>
        <textarea
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          rows={3}
          className={`border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:border-transparent resize-none ${
            templateError ? 'border-red-300' : 'border-zinc-200'
          }`}
        />
        <div className="flex items-center justify-between">
          {templateError ? (
            <p className="text-xs text-red-500">{templateError}</p>
          ) : (
            <span />
          )}
          <p className={`text-xs ${template.length > MAX_SMS_CHARS ? 'text-amber-600' : 'text-zinc-400'}`}>
            {template.length} / {MAX_SMS_CHARS} chars
            {template.length > MAX_SMS_CHARS && ' — will send as multiple SMS segments'}
          </p>
        </div>
      </div>

      {/* Save */}
      <div className="p-6 flex items-center gap-4">
        <button
          type="submit"
          disabled={saving || !!templateError || !name.trim()}
          className="text-white rounded-lg px-5 py-2 text-sm font-semibold hover:brightness-110 transition-all disabled:opacity-50"
          style={{ backgroundColor: themeColor }}
        >
          {saving ? 'Saving…' : 'Save settings'}
        </button>
        {message && (
          <p className={`text-sm ${message.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>
            {message.type === 'success' ? '✓ ' : '✗ '}{message.text}
          </p>
        )}
      </div>
    </form>
  )
}
