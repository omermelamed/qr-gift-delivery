'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

const NAV = [
  { href: '/platform/companies', label: 'Companies', icon: 'business' },
]

export function PlatformSidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <aside className="w-56 bg-nav border-nav border-e flex flex-col min-h-screen">
      <div className="px-5 py-5 border-b border-nav">
        <span className="text-nav font-bold text-base">GiftFlow</span>
        <span className="ms-2 text-[10px] font-semibold uppercase tracking-widest text-nav opacity-70">Platform</span>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {NAV.map(({ href, label, icon }) => {
          const active = pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className={`text-nav flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                active ? 'bg-nav-active' : 'bg-nav-hover'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{icon}</span>
              {label}
            </Link>
          )
        })}
      </nav>

      <div className="px-3 py-4 border-t border-nav">
        <button
          onClick={handleSignOut}
          className="text-nav flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium bg-nav-hover transition-colors w-full"
        >
          <span className="material-symbols-outlined text-[18px]">logout</span>
          Sign out
        </button>
      </div>
    </aside>
  )
}
