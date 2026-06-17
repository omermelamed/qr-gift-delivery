import { createServiceClient } from '@/lib/supabase/server'
import { CompaniesUI } from '@/components/platform/CompaniesUI'

export default async function PlatformCompaniesPage() {
  const service = createServiceClient()
  const { data: companies } = await service
    .from('companies')
    .select('id, name, slug, active, created_at')
    .order('created_at', { ascending: false })

  return <CompaniesUI initialCompanies={companies ?? []} />
}
