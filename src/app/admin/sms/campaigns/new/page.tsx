import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { CampaignCreateForm } from '@/components/sms/CampaignCreateForm'
import { PageHeading } from '@/components/sms/PageHeading'

export default async function NewSmsCampaignPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const appMeta = user.app_metadata as JwtAppMetadata

  const service = createServiceClient()

  const [templatesResult, creditsResult] = await Promise.all([
    service
      .from('message_templates')
      .select('id, name, body_template, variables')
      .eq('company_id', appMeta.company_id)
      .order('updated_at', { ascending: false }),
    service
      .from('credits')
      .select('balance')
      .eq('company_id', appMeta.company_id)
      .single(),
  ])

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <PageHeading text="New SMS Campaign" />
      <CampaignCreateForm
        templates={templatesResult.data ?? []}
        creditBalance={creditsResult.data?.balance ?? 0}
      />
    </div>
  )
}
