'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

export function PlatformSidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.refresh()
  }

  const isCompanies = pathname === '/platform' || pathname.startsWith('/platform/companies')
  const isActivity = pathname.startsWith('/platform/activity')

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
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex-shrink-0" />
        <span className="text-white font-bold text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75">
          GiftFlow
        </span>
      </div>

      {/* Platform label */}
      <div className="px-3 py-2 border-b border-zinc-800 flex-shrink-0 overflow-hidden">
        <span className="text-xs text-zinc-500 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75 uppercase tracking-wider font-medium">
          Platform
        </span>
      </div>

      {/* Nav */}
      <div className="flex flex-col gap-1 p-2 flex-1">
        {navItem('/platform', 'Companies', isCompanies,
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        )}
        {navItem('/platform/activity', 'Activity', isActivity,
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
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
