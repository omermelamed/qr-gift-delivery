'use client'

import { useT } from '@/lib/i18n/useT'

const ACTION_KEY: Record<string, string> = {
  'campaign.created': 'Created campaign',
  'campaign.launched': 'Launched campaign',
  'campaign.closed': 'Closed campaign',
  'campaign.deleted': 'Deleted campaign',
  'campaign.duplicated': 'Duplicated campaign',
  'campaign.reminder_sent': 'Sent reminder',
  'token.redeemed': 'Redeemed gift',
}

type AuditEvent = {
  id: string
  action: string
  metadata: Record<string, unknown>
  created_at: string
  actorName: string
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

export function AuditLogPage({ events }: { events: AuditEvent[] }) {
  const t = useT()

  function resourceLabel(action: string, metadata: Record<string, unknown>): string {
    if (metadata.name) return `"${metadata.name}"`
    if (metadata.employee_name) return String(metadata.employee_name)
    return ''
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">{t('Audit Log')}</h1>
        <p className="text-sm text-zinc-500 mt-0.5">{t('Last 50 actions in your company')}</p>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        {events.length === 0 ? (
          <div className="text-center py-16 text-zinc-400 text-sm">{t('No activity yet.')}</div>
        ) : (
          <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="text-xs text-zinc-400 border-b border-zinc-100">
          <th className="px-5 py-3 font-medium text-start">{t('Time')}</th>
          <th className="px-5 py-3 font-medium text-start">{t('Who')}</th>
          <th className="px-5 py-3 font-medium text-start">{t('Action')}</th>
        </tr>
      </thead>
      <tbody>
        {events.map((e) => {
          const label = t(ACTION_KEY[e.action] ?? e.action)
          const resource = resourceLabel(e.action, e.metadata)
          return (
            <tr key={e.id} className="border-b border-zinc-50 hover-brand">
              <td className="px-5 py-3 text-zinc-400 text-xs whitespace-nowrap">
                {formatDate(e.created_at)}
              </td>
              <td className="px-5 py-3 font-medium text-zinc-700">{e.actorName}</td>
              <td className="px-5 py-3 text-zinc-600">
                {label}{resource ? <> <span className="font-medium text-zinc-800">{resource}</span></> : ''}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
        )}
      </div>
    </div>
  )
}
