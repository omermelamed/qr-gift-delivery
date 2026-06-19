'use client'

import Link from 'next/link'
import { useT } from '@/lib/i18n/useT'
import { TemplateList } from './TemplateList'

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

export function TemplatesPageUI({ templates }: Props) {
  const t = useT()

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-zinc-900">{t('Message Templates')}</h1>
        <Link
          href="/admin/sms/templates/new"
          className="text-white rounded-lg px-4 py-2 text-sm font-semibold hover:brightness-110 transition-all"
          style={{ backgroundColor: 'var(--brand, #6366f1)' }}
        >
          {t('+ New Template')}
        </Link>
      </div>

      <TemplateList templates={templates} />
    </div>
  )
}
