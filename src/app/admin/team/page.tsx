import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { RemoveMemberButton } from '@/components/admin/RemoveMemberButton'
import { ResendInviteButton } from '@/components/admin/ResendInviteButton'
import { InviteButton } from '@/components/admin/InviteButton'

type Member = {
  id: string
  email: string
  name: string
  role_name: string
  isPending: boolean
  isSelf: boolean
}

const ROLE_LABELS: Record<string, string> = {
  company_admin: 'Admin',
  campaign_manager: 'Campaign Manager',
  scanner: 'Scanner',
  platform_admin: 'Platform Admin',
}

export default async function TeamPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const appMeta = user.app_metadata as JwtAppMetadata
  if (appMeta.role_name !== 'company_admin') redirect('/admin')

  const service = createServiceClient()

  const { data: ucr } = await service
    .from('user_company_roles')
    .select('user_id, role_id, roles(name)')
    .eq('company_id', appMeta.company_id)

  const companyUserIds = (ucr ?? []).map((r) => r.user_id)

  const { data: { users: allUsers } } = await service.auth.admin.listUsers({ perPage: 1000 })
  const companyUsers = allUsers.filter((u) => companyUserIds.includes(u.id))

  const members: Member[] = companyUsers.map((u) => {
    const ucrRow = (ucr ?? []).find((r) => r.user_id === u.id)
    const roleRow = ucrRow?.roles as unknown as { name: string } | null
    return {
      id: u.id,
      email: u.email ?? '',
      name: u.user_metadata?.full_name ?? u.email?.split('@')[0] ?? '—',
      role_name: roleRow?.name ?? (u.app_metadata as JwtAppMetadata)?.role_name ?? '—',
      isPending: !u.last_sign_in_at,
      isSelf: u.id === user.id,
    }
  })

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Team</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{members.length} member{members.length !== 1 ? 's' : ''}</p>
        </div>
        <InviteButton />
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        {members.length === 0 ? (
          <div className="text-center py-16 text-zinc-400 text-sm">
            No team members yet. Invite someone to get started.
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-zinc-400 border-b border-zinc-100">
                <th className="px-5 py-3 font-medium">Member</th>
                <th className="px-5 py-3 font-medium">Role</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium w-10" />
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
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {m.isPending && !m.isSelf && (
                        <ResendInviteButton userId={m.id} />
                      )}
                      {!m.isSelf && <RemoveMemberButton userId={m.id} name={m.name} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
