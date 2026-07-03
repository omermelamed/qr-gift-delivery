'use client'

import { useState } from 'react'
import { RemoveMemberButton } from '@/components/admin/RemoveMemberButton'
import { InviteButton } from '@/components/admin/InviteButton'
import { EditMemberButton } from '@/components/admin/EditMemberButton'
import { KebabMenu } from '@/components/admin/KebabMenu'
import { MENU_ITEM, MENU_ITEM_DANGER } from '@/components/admin/menuItemStyles'
import { BackButton } from '@/components/BackButton'
import { useT } from '@/lib/i18n/useT'

export type Member = {
  id: string
  email: string
  name: string
  phone: string
  role_name: string
  isPending: boolean
  isReinvited: boolean
  isDeactivated: boolean
  isSelf: boolean
}

type Props = { members: Member[] }

export function TeamPageUI({ members }: Props) {
  const t = useT()
  const [search, setSearch] = useState('')

  const ROLE_LABELS: Record<string, string> = {
    company_admin: t('Admin'),
    campaign_manager: t('Campaign Manager'),
    scanner: t('Scanner'),
    platform_admin: t('Platform Admin'),
  }

  const filtered = members.filter((m) => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      m.name.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q) ||
      (ROLE_LABELS[m.role_name] ?? m.role_name).toLowerCase().includes(q)
    )
  })

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <BackButton className="mb-4" />
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">{t('Team')}</h1>
          <p className="text-sm text-zinc-500 mt-0.5">
            {members.length} {members.length !== 1 ? t('members') : t('member')}
          </p>
        </div>
        <InviteButton />
      </div>

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('Search by name or email…')}
          className="w-full border border-zinc-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 ring-brand focus:border-transparent"
        />
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 overflow-x-auto">
        {members.length === 0 ? (
          <div className="text-center py-16 text-zinc-400 text-sm">
            {t('No team members yet. Invite someone to get started.')}
          </div>
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-start text-xs text-zinc-400 border-b border-zinc-100">
                <th className="px-5 py-3 font-medium text-start">{t('Member')}</th>
                <th className="px-5 py-3 font-medium text-start">{t('Phone')}</th>
                <th className="px-5 py-3 font-medium text-start">{t('Role')}</th>
                <th className="px-5 py-3 font-medium text-start">{t('Status')}</th>
                <th className="px-5 py-3 font-medium w-10" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-sm text-zinc-400">
                    {t('No members match your search.')}
                  </td>
                </tr>
              )}
              {filtered.map((m) => (
                <tr key={m.id} className="border-b border-zinc-50 hover-brand">
                  <td className="px-5 py-3">
                    <p className="font-medium text-zinc-900">{m.name}</p>
                    <p className="text-xs text-zinc-400">{m.email}</p>
                  </td>
                  <td className="px-5 py-3 text-zinc-500 font-mono text-xs">
                    {m.phone ? <span dir="ltr">{m.phone}</span> : <span className="text-zinc-300">—</span>}
                  </td>
                  <td className="px-5 py-3 text-zinc-600">{ROLE_LABELS[m.role_name] ?? m.role_name}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      m.isDeactivated ? 'bg-zinc-100 text-zinc-500'
                        : m.isPending ? 'bg-violet-100 text-violet-700'
                        : m.isReinvited ? 'bg-amber-100 text-amber-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      {m.isDeactivated ? t('Deactivated') : m.isPending ? t('Pending') : m.isReinvited ? t('Re-invited') : t('Active')}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-end">
                    <div className="flex items-center justify-end">
                      <KebabMenu>
                        <EditMemberButton
                          userId={m.id} name={m.name} email={m.email}
                          phone={m.phone} roleName={m.role_name}
                          isActive={!m.isDeactivated}
                          isPending={m.isPending} isSelf={m.isSelf}
                          className={MENU_ITEM}
                        />
                        {!m.isSelf && <RemoveMemberButton userId={m.id} name={m.name} className={MENU_ITEM_DANGER} />}
                      </KebabMenu>
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
