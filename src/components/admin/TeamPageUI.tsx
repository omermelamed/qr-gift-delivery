'use client'

import { RemoveMemberButton } from '@/components/admin/RemoveMemberButton'
import { InviteButton } from '@/components/admin/InviteButton'
import { EditMemberButton } from '@/components/admin/EditMemberButton'
import { useT } from '@/lib/i18n/useT'

export type Member = {
  id: string
  email: string
  name: string
  role_name: string
  isPending: boolean
  isDeactivated: boolean
  isSelf: boolean
}

type Props = { members: Member[] }

export function TeamPageUI({ members }: Props) {
  const t = useT()

  const ROLE_LABELS: Record<string, string> = {
    company_admin: t('Admin'),
    campaign_manager: t('Campaign Manager'),
    scanner: t('Scanner'),
    platform_admin: t('Platform Admin'),
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">{t('Team')}</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {members.length} {members.length !== 1 ? t('members') : t('member')}
          </p>
        </div>
        <InviteButton />
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
        {members.length === 0 ? (
          <div className="text-center py-16 text-zinc-400 text-sm">
            {t('No team members yet. Invite someone to get started.')}
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-start text-xs text-zinc-400 border-b border-zinc-100">
                <th className="px-5 py-3 font-medium text-start">{t('Member')}</th>
                <th className="px-5 py-3 font-medium text-start">{t('Role')}</th>
                <th className="px-5 py-3 font-medium text-start">{t('Status')}</th>
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
                      m.isDeactivated ? 'bg-zinc-100 text-zinc-500'
                        : m.isPending ? 'bg-violet-100 text-violet-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {m.isDeactivated ? t('Deactivated') : m.isPending ? t('Pending') : t('Active')}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-end">
                    <div className="flex items-center justify-end gap-2">
                      <EditMemberButton
                        userId={m.id} name={m.name} email={m.email}
                        roleName={m.role_name} isActive={!m.isDeactivated}
                        isPending={m.isPending} isSelf={m.isSelf}
                      />
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
