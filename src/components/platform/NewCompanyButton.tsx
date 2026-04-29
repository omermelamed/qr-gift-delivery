'use client'

import { useState } from 'react'
import { NewCompanyModal } from '@/components/platform/NewCompanyModal'

export function NewCompanyButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:brightness-110 transition-all"
      >
        + New Company
      </button>
      {open && <NewCompanyModal onClose={() => setOpen(false)} />}
    </>
  )
}
