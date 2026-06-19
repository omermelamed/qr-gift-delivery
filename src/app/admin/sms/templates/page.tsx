import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { resolveCompanyId } from '@/lib/platform-auth'
import { TemplatesPageUI } from '@/components/sms/TemplatesPageUI'

export default async function TemplatesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const appMeta = user.app_metadata as JwtAppMetadata

  const companyId = await resolveCompanyId(appMeta)
  if (!companyId) redirect('/login')

  const service = createServiceClient()
  const { data } = await service
    .from('message_templates')
    .select('id, name, body_template, variables, updated_at')
    .eq('company_id', companyId)
    .order('updated_at', { ascending: false })

  return <TemplatesPageUI templates={data ?? []} />
}
