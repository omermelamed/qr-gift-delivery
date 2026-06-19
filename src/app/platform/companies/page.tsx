import { createServiceClient } from '@/lib/supabase/server'
import { CompaniesUI } from '@/components/platform/CompaniesUI'

export default async function PlatformCompaniesPage() {
  const service = createServiceClient()
  const { data: companies } = await service
    .from('companies')
    .select('id, name, slug, active, created_at')
    .order('created_at', { ascending: false })

  const companyIds = (companies ?? []).map((c) => c.id)

  const adminEmails = new Map<string, string>()
  if (companyIds.length > 0) {
    const { data: ucr } = await service
      .from('user_company_roles')
      .select('user_id, company_id, roles(name)')
      .in('company_id', companyIds)

    const adminUcrByCompany = new Map<string, string>()
    for (const row of ucr ?? []) {
      const roleName = (row.roles as unknown as { name: string } | null)?.name
      if (roleName === 'company_admin' && !adminUcrByCompany.has(row.company_id)) {
        adminUcrByCompany.set(row.company_id, row.user_id)
      }
    }

    const userIds = [...new Set(adminUcrByCompany.values())]
    if (userIds.length > 0) {
      const { data: { users } } = await service.auth.admin.listUsers({ perPage: 1000 })
      const userMap = new Map(users.map((u) => [u.id, u.email ?? '']))
      for (const [cid, uid] of adminUcrByCompany) {
        const email = userMap.get(uid)
        if (email) adminEmails.set(cid, email)
      }
    }
  }

  const { data: allCredits } = companyIds.length > 0
    ? await service.from('credits').select('company_id, balance').in('company_id', companyIds)
    : { data: [] }
  const creditsByCompany = new Map((allCredits ?? []).map((c) => [c.company_id, c.balance]))

  const companiesWithEmail = (companies ?? []).map((c) => ({
    ...c,
    admin_email: adminEmails.get(c.id) ?? null,
    credit_balance: creditsByCompany.get(c.id) ?? 0,
  }))

  return <CompaniesUI initialCompanies={companiesWithEmail} />
}
