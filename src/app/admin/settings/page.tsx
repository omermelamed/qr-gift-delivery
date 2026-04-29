import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { SettingsForm } from '@/components/admin/SettingsForm'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const meta = user.app_metadata as JwtAppMetadata
  if (meta.role_name !== 'company_admin') redirect('/admin')

  const service = createServiceClient()
  let company: { id: string; name: string; logo_url: string | null; sms_template: string | null } | null = null
  try {
    const { data } = await service
      .from('companies')
      .select('id, name, logo_url, sms_template')
      .eq('id', meta.company_id)
      .single()
    company = data
  } catch {
    // migration 006 not yet applied — fall back gracefully
  }

  if (!company) redirect('/admin')

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">Settings</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Manage your company profile and SMS defaults</p>
      </div>
      <SettingsForm
        companyId={company.id}
        initialName={company.name}
        initialLogoUrl={company.logo_url}
        initialTemplate={company.sms_template}
      />
    </div>
  )
}
