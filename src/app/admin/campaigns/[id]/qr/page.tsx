import { notFound } from 'next/navigation'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { resolveCompanyId } from '@/lib/platform-auth'
import { PrintButton } from './PrintButton'
import { QrGrid } from './QrGrid'

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
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Link
            href={`/admin/campaigns/${campaignId}`}
            className="text-sm text-zinc-400 hover:text-zinc-700 transition-colors"
          >
            ← {campaign.name}
          </Link>
          <h1 className="text-2xl font-bold text-zinc-900 mt-2">QR Codes</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{rows.length} codes · share or print this page</p>
        </div>
        <PrintButton />
      </div>

      {rows.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl border border-zinc-200">
          <p className="text-zinc-500">No QR codes found for this campaign.</p>
        </div>
      ) : (
        <QrGrid rows={rows} />
      )}
    </div>
  )
}
