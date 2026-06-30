'use client'

import { useState } from 'react'
import { InviteMemberModal } from '@/components/admin/InviteMemberModal'
import { useT } from '@/lib/i18n/useT'

export function InviteButton() {
  const t = useT()
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-brand text-white rounded-lg px-4 py-2 text-sm font-semibold hover:brightness-110 transition-all"
      >
        {t('+ Invite member')}
      </button>
      {open && <InviteMemberModal onClose={() => setOpen(false)} />}
    </>
  )
}
