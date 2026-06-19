'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/useT'

type Template = {
  id: string
  name: string
  body_template: string
  variables: string[]
}

type Props = {
  templates: Template[]
  creditBalance: number
}

export function CampaignCreateForm({ templates, creditBalance }: Props) {
  const t = useT()
  const router = useRouter()
  const [name, setName] = useState('')
  const [templateId, setTemplateId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const selectedTemplate = templates.find((tmpl) => tmpl.id === templateId)

  async function handleCreate() {
    if (!name.trim()) return
    setSaving(true)
    setError(null)

    const res = await fetch('/api/sms/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        templateId: templateId || undefined,
      }),
    })

    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      setError(data.error ?? t('Something went wrong'))
      setSaving(false)
      return
    }

    const { id } = await res.json()
    router.push(`/admin/sms/campaigns/${id}`)
  }

  return (
    <div className="max-w-2xl space-y-6">
      {creditBalance === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.072 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <div>
            <p className="text-sm font-semibold text-amber-800">{t('No credits available')}</p>
            <p className="text-sm text-amber-600 mt-0.5">{t('Purchase credits before sending a campaign.')}</p>
          </div>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1">{t('Campaign Name')}</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. June Event Invite"
          className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-zinc-700 mb-1">{t('Message Template')}</label>
        <select
          value={templateId}
          onChange={(e) => setTemplateId(e.target.value)}
          className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white"
        >
          <option value="">{t('No template (custom message per recipient)')}</option>
          {templates.map((tmpl) => (
            <option key={tmpl.id} value={tmpl.id}>{tmpl.name}</option>
          ))}
        </select>

        {selectedTemplate && (
          <div className="mt-3 bg-zinc-50 border border-zinc-200 rounded-lg p-3">
            <p className="text-xs text-zinc-400 mb-1">{t('Template preview')}</p>
            <p className="text-sm text-zinc-700 font-mono whitespace-pre-wrap">{selectedTemplate.body_template}</p>
            {selectedTemplate.variables.length > 0 && (
              <div className="flex gap-1.5 mt-2">
                {selectedTemplate.variables.map((v) => (
                  <span key={v} className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium">
                    {`{{${v}}}`}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="bg-zinc-50 border border-zinc-200 rounded-lg p-4">
        <p className="text-sm text-zinc-500">
          <span className="font-medium text-zinc-700">{t('Credits available:')}</span>{' '}
          <span className={creditBalance === 0 ? 'text-red-600 font-semibold' : 'text-emerald-600 font-semibold'}>
            {creditBalance.toLocaleString()}
          </span>
        </p>
        <p className="text-xs text-zinc-400 mt-1">
          {t("You'll add recipients after creating the campaign.")}
        </p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={() => router.back()}
          className="px-4 py-2.5 rounded-lg border border-zinc-200 text-zinc-600 font-medium hover:bg-zinc-50 transition-colors"
        >
          {t('Cancel')}
        </button>
        <button
          onClick={handleCreate}
          disabled={!name.trim() || saving}
          className="px-6 py-2.5 rounded-lg text-white font-semibold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ backgroundColor: 'var(--brand, #6366f1)' }}
        >
          {saving ? t('Creating…') : t('Create Campaign')}
        </button>
      </div>
    </div>
  )
}
