import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'

const ACTION_LABELS: Record<string, string> = {
  'campaign.created': 'Created campaign',
  'campaign.launched': 'Launched campaign',
  'campaign.closed': 'Closed campaign',
  'campaign.deleted': 'Deleted campaign',
  'campaign.duplicated': 'Duplicated campaign',
  'campaign.reminder_sent': 'Sent reminder',
  'token.redeemed': 'Redeemed gift',
}

export default async function AuditPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const appMeta = user.app_metadata as JwtAppMetadata
  if (appMeta.role_name !== 'company_admin') redirect('/admin')

  const service = createServiceClient()

  const { data: events } = await service
    .from('audit_events')
    .select('id, action, resource_type, metadata, created_at, actor_id')
    .eq('company_id', appMeta.company_id)
    .order('created_at', { ascending: false })
    .limit(50)

  const actorIds = [...new Set((events ?? []).map((e) => e.actor_id).filter(Boolean) as string[])]
  const actorNames = new Map<string, string>()
  await Promise.all(
    actorIds.map(async (id) => {
      const result = await service.auth.admin.getUserById(id)
      const u = result.data?.user
      actorNames.set(id, u?.user_metadata?.full_name ?? u?.email?.split('@')[0] ?? id)
    })
  )

  function resourceLabel(action: string, metadata: Record<string, unknown>): string {
    if (metadata.name) return `"${metadata.name}"`
    if (metadata.employee_name) return String(metadata.employee_name)
    return ''
  }

  function formatDate(iso: string) {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
    })
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">Audit Log</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Last 50 actions in your company</p>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        {(!events || events.length === 0) ? (
          <div className="text-center py-16 text-zinc-400 text-sm">No activity yet.</div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-zinc-400 border-b border-zinc-100">
                <th className="px-5 py-3 font-medium">Time</th>
                <th className="px-5 py-3 font-medium">Who</th>
                <th className="px-5 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {(events ?? []).map((e) => {
                const meta = e.metadata as Record<string, unknown>
                const label = ACTION_LABELS[e.action] ?? e.action
                const resource = resourceLabel(e.action, meta)
                const actor = e.actor_id ? (actorNames.get(e.actor_id) ?? 'Unknown') : 'System'
                return (
                  <tr key={e.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                    <td className="px-5 py-3 text-zinc-400 text-xs whitespace-nowrap">
                      {formatDate(e.created_at)}
                    </td>
                    <td className="px-5 py-3 font-medium text-zinc-700">{actor}</td>
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
