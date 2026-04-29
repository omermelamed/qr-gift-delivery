import { notFound } from 'next/navigation'
import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'

const ROLE_LABELS: Record<string, string> = {
  company_admin: 'Admin',
  campaign_manager: 'Campaign Manager',
  scanner: 'Scanner',
}

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: companyId } = await params
  const service = createServiceClient()

  const { data: company } = await service
    .from('companies')
    .select('id, name, slug, created_at')
    .eq('id', companyId)
    .single()

  if (!company) notFound()

  const { data: ucr } = await service
    .from('user_company_roles')
    .select('user_id, roles(name)')
    .eq('company_id', companyId)

  const userIds = (ucr ?? []).map((r) => r.user_id)
  const { data: { users: allUsers } } = await service.auth.admin.listUsers({ perPage: 1000 })
  const members = allUsers
    .filter((u) => userIds.includes(u.id))
    .map((u) => {
      const ucrRow = (ucr ?? []).find((r) => r.user_id === u.id)
      const roleRow = (ucrRow?.roles as unknown as { name: string } | null)
      return {
        id: u.id,
        email: u.email ?? '',
        name: u.user_metadata?.full_name ?? u.email?.split('@')[0] ?? '—',
        role_name: roleRow?.name ?? (u.app_metadata as JwtAppMetadata)?.role_name ?? '—',
        isPending: !u.last_sign_in_at,
      }
    })

  const { data: campaigns } = await service
    .from('campaigns')
    .select('id, name, campaign_date, sent_at')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <Link href="/platform" className="text-sm text-zinc-400 hover:text-zinc-700 transition-colors">
          ← Companies
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-zinc-900 mb-1">{company.name}</h1>
      <p className="text-sm text-zinc-400 font-mono mb-8">{company.slug}</p>

      {/* Members */}
      <section className="mb-8">
        <h2 className="text-base font-semibold text-zinc-900 mb-3">Members ({members.length})</h2>
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          {members.length === 0 ? (
            <p className="px-5 py-8 text-center text-zinc-400 text-sm">No members</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-xs text-zinc-400 border-b border-zinc-100">
                  <th className="px-5 py-3 font-medium">Member</th>
                  <th className="px-5 py-3 font-medium">Role</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                    <td className="px-5 py-3">
                      <p className="font-medium text-zinc-900">{m.name}</p>
                      <p className="text-xs text-zinc-400">{m.email}</p>
                    </td>
                    <td className="px-5 py-3 text-zinc-600">{ROLE_LABELS[m.role_name] ?? m.role_name}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        m.isPending ? 'bg-violet-100 text-violet-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {m.isPending ? 'Pending' : 'Active'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Campaigns */}
      <section>
        <h2 className="text-base font-semibold text-zinc-900 mb-3">Campaigns ({(campaigns ?? []).length})</h2>
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          {!campaigns?.length ? (
            <p className="px-5 py-8 text-center text-zinc-400 text-sm">No campaigns</p>
          ) : (
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-xs text-zinc-400 border-b border-zinc-100">
                  <th className="px-5 py-3 font-medium">Campaign</th>
                  <th className="px-5 py-3 font-medium">Date</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((c) => (
                  <tr key={c.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                    <td className="px-5 py-3 font-medium text-zinc-900">{c.name}</td>
                    <td className="px-5 py-3 text-zinc-500">{c.campaign_date ?? '—'}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        c.sent_at ? 'bg-green-100 text-green-700' : 'bg-violet-100 text-violet-700'
                      }`}>
                        {c.sent_at ? 'Sent' : 'Draft'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  )
}
