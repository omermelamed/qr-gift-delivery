'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/useT'

type Template = {
  id: string
  name: string
  body_template: string
  variables: string[]
  updated_at: string
}

type Props = {
  templates: Template[]
}

export function TemplateList({ templates }: Props) {
  const t = useT()
  const router = useRouter()
  const [deleting, setDeleting] = useState<string | null>(null)

  async function handleDelete(id: string) {
    if (!confirm(t('Delete this template? This cannot be undone.'))) return
    setDeleting(id)

    const res = await fetch(`/api/sms/templates/${id}`, { method: 'DELETE' })
    if (res.ok) {
      router.refresh()
    }
    setDeleting(null)
  }

  if (templates.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border border-zinc-200">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 mx-auto mb-4 flex items-center justify-center">
          <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        </div>
        <p className="text-zinc-900 font-semibold mb-1">{t('No templates yet')}</p>
        <p className="text-sm text-zinc-500 mb-6">{t('Create a reusable message template for your campaigns.')}</p>
        <Link
          href="/admin/sms/templates/new"
          className="text-white rounded-lg px-4 py-2 text-sm font-semibold hover:brightness-110 transition-all"
          style={{ backgroundColor: 'var(--brand, #6366f1)' }}
        >
          {t('+ New Template')}
        </Link>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {templates.map((tmpl) => (
        <div
          key={tmpl.id}
          className="bg-white border border-zinc-200 rounded-xl p-5 hover:shadow-md transition-shadow group"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-zinc-900 truncate">{tmpl.name}</p>
              <p className="text-sm text-zinc-400 mt-1 line-clamp-2 font-mono">{tmpl.body_template}</p>
              <div className="flex items-center gap-2 mt-2">
                {tmpl.variables.map((v) => (
                  <span key={v} className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 font-medium">
                    {`{{${v}}}`}
                  </span>
                ))}
                <span className="text-xs text-zinc-300">·</span>
                <span className="text-xs text-zinc-400">
                  {t('Updated')} {new Date(tmpl.updated_at).toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' })}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <Link
                href={`/admin/sms/templates/${tmpl.id}/edit`}
                className="text-xs px-3 py-1.5 rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 transition-colors"
              >
                {t('Edit')}
              </Link>
              <button
                onClick={() => handleDelete(tmpl.id)}
                disabled={deleting === tmpl.id}
                className="text-xs px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {deleting === tmpl.id ? '...' : t('Delete')}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
