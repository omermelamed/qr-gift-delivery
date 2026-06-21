import { notFound } from 'next/navigation'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { resolveCompanyId } from '@/lib/platform-auth'
import { QrGrid } from './QrGrid'
import { QrPageHeader } from './QrPageHeader'

export default async function CampaignQrPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: campaignId } = await params

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const appMeta = user.app_metadata as JwtAppMetadata

  const companyId = await resolveCompanyId(appMeta)
  if (!companyId) redirect('/login')

  const service = createServiceClient()

  const { data: campaign } = await service
    .from('campaigns')
    .select('id, name, sent_at')
    .eq('id', campaignId)
    .eq('company_id', companyId)
    .single()

  if (!campaign) notFound()
  if (!campaign.sent_at) redirect(`/admin/campaigns/${campaignId}`)

  const [tokensResult, employeesResult] = await Promise.all([
    service
      .from('gift_tokens')
      .select('id, employee_name, phone_number, department, token, qr_image_url, redeemed')
      .eq('campaign_id', campaignId)
      .order('employee_name'),
    service
      .from('employees')
      .select('id, employee_name, phone, department')
      .eq('company_id', companyId),
  ])

  const employees = employeesResult.data ?? []
  const empByName = new Map(employees.map((e) => [e.employee_name, e]))
  const empByPhone = new Map(employees.filter((e) => e.phone).map((e) => [e.phone!, e]))

  const rows = (tokensResult.data ?? []).map((t) => {
    const emp = empByName.get(t.employee_name) ?? (t.phone_number ? empByPhone.get(t.phone_number) : undefined)
    return {
      id: t.id,
      employee_name: emp?.employee_name ?? t.employee_name,
      phone_number: emp?.phone ?? t.phone_number,
      department: emp?.department ?? t.department,
      token: t.token,
      qr_image_url: t.qr_image_url,
      redeemed: t.redeemed,
    }
  })

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <QrPageHeader campaignId={campaignId} campaignName={campaign.name} count={rows.length} />
      <QrGrid rows={rows} />
    </div>
  )
}
