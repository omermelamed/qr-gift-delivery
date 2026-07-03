import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { fetchPermissions, hasPermission } from '@/lib/permissions'
import { resolveCompanyId } from '@/lib/platform-auth'
import { logAuditEvent } from '@/lib/audit'
import type { JwtAppMetadata } from '@/types'

export default async function NewCampaignPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const appMeta = user.app_metadata as JwtAppMetadata
  const companyId = await resolveCompanyId(appMeta)
  if (!companyId) redirect('/login')

  const permissions = await fetchPermissions(appMeta.role_id, appMeta.role_name)
  if (!hasPermission(permissions, 'campaigns:create')) redirect('/admin')

  const service = createServiceClient()
  const { data, error } = await service
    .from('campaigns')
    .insert({ name: '', campaign_date: null, company_id: companyId, created_by: user.id })
    .select('id')
    .single()

  if (error || !data) redirect('/admin')

  logAuditEvent({
    companyId,
    actorId: user.id,
    action: 'campaign.created',
    resourceType: 'campaign',
    resourceId: data.id,
    metadata: { name: '' },
  })

  redirect(`/admin/campaigns/${data.id}?step=1`)
}
