'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

type Props = { logoUrl?: string }

export function Sidebar({ logoUrl }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.refresh()
  }

  const isCampaigns = pathname === '/admin' || pathname.startsWith('/admin/campaigns')
  const isTeam = pathname.startsWith('/admin/team')
  const isSettings = pathname.startsWith('/admin/settings')

  const navItem = (href: string, label: string, isActive: boolean, icon: React.ReactNode) => (
    <Link
      href={href}
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      className={`flex items-center gap-3 px-2 py-2 rounded-lg transition-colors ${
        isActive ? 'bg-indigo-600 text-white' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
      }`}
    >
      {icon}
      <span className="text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75">
        {label}
      </span>
    </Link>
  )

  return (
    <nav className="group flex flex-col bg-zinc-900 w-14 hover:w-56 transition-all duration-200 overflow-hidden flex-shrink-0 min-h-screen">
      {/* Logo */}
      <div className="flex items-center gap-3 h-14 px-3 border-b border-zinc-800 flex-shrink-0">
        {logoUrl ? (
          <img src={logoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-cover flex-shrink-0" />
        ) : (
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex-shrink-0" />
        )}
        <span className="text-white font-bold text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75">
          GiftFlow
        </span>
      </div>

      {/* Nav items */}
      <div className="flex flex-col gap-1 p-2 flex-1">
        {navItem('/admin', 'Campaigns', isCampaigns,
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        )}
        {navItem('/admin/team', 'Team', isTeam,
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )}
        {navItem('/admin/settings', 'Settings', isSettings,
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )}
      </div>

      {/* Sign out */}
      <div className="p-2 border-t border-zinc-800 flex-shrink-0">
        <button
          onClick={handleSignOut}
          aria-label="Sign out"
          className="flex items-center gap-3 px-2 py-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors w-full"
        >
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span className="text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75">
            Sign out
          </span>
        </button>
      </div>
    </nav>
  )
}
