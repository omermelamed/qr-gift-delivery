import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { AuditLogPage } from './AuditLogTable'
import type { JwtAppMetadata } from '@/types'

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

  const rows = (events ?? []).map((e) => ({
    id: e.id,
    action: e.action,
    metadata: e.metadata as Record<string, unknown>,
    created_at: e.created_at,
    actorName: e.actor_id ? (actorNames.get(e.actor_id) ?? 'Unknown') : 'System',
  }))

  return <AuditLogPage events={rows} />
}
