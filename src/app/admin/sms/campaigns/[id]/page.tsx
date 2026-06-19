import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { CampaignDetailUI } from '@/components/sms/CampaignDetailUI'

type Props = { params: Promise<{ id: string }> }

export default async function SmsCampaignDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const appMeta = user.app_metadata as JwtAppMetadata

  const service = createServiceClient()

  const [campaignResult, messagesResult, creditsResult] = await Promise.all([
    service
      .from('sms_campaigns')
      .select('id, name, status, template_id, recipients_count, sent_count, failed_count, credits_reserved, created_at, sent_at')
      .eq('id', id)
      .eq('company_id', appMeta.company_id)
      .single(),
    service
      .from('sms_messages')
      .select('id, recipient_phone, recipient_name, status, error_message, sent_at, delivered_at')
      .eq('campaign_id', id)
      .order('created_at', { ascending: true }),
    service
      .from('credits')
      .select('balance')
      .eq('company_id', appMeta.company_id)
      .single(),
  ])

  if (!campaignResult.data) redirect('/admin/sms')

  let template = null
  if (campaignResult.data.template_id) {
    const { data } = await service
      .from('message_templates')
      .select('id, name, body_template, variables')
      .eq('id', campaignResult.data.template_id)
      .single()
    template = data
  }

  return (
    <CampaignDetailUI
      campaign={campaignResult.data}
      messages={messagesResult.data ?? []}
      template={template}
      creditBalance={creditsResult.data?.balance ?? 0}
    />
  )
}
