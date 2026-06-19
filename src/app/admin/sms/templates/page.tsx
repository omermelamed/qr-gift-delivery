import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { TemplatesPageUI } from '@/components/sms/TemplatesPageUI'

export default async function TemplatesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const appMeta = user.app_metadata as JwtAppMetadata

  const service = createServiceClient()
  const { data } = await service
    .from('message_templates')
    .select('id, name, body_template, variables, updated_at')
    .eq('company_id', appMeta.company_id)
    .order('updated_at', { ascending: false })

  return <TemplatesPageUI templates={data ?? []} />
}
