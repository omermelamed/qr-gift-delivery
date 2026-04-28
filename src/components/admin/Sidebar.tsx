'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
  }

  const isCampaigns = pathname.startsWith('/admin')

  return (
    <nav className="group flex flex-col bg-zinc-900 w-14 hover:w-56 transition-all duration-200 overflow-hidden flex-shrink-0 min-h-screen z-10">
      {/* Logo */}
      <div className="flex items-center gap-3 h-14 px-3 border-b border-zinc-800 flex-shrink-0">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex-shrink-0" />
        <span className="text-white font-bold text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75">
          GiftFlow
        </span>
      </div>

      {/* Nav items */}
      <div className="flex flex-col gap-1 p-2 flex-1">
        <Link
          href="/admin"
          className={`flex items-center gap-3 px-2 py-2 rounded-lg transition-colors ${
            isCampaigns
              ? 'bg-indigo-600 text-white'
              : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
          }`}
        >
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span className="text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75">
            Campaigns
          </span>
        </Link>
      </div>

      {/* Sign out */}
      <div className="p-2 border-t border-zinc-800 flex-shrink-0">
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-2 py-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors w-full"
        >
          <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          <span className="text-sm font-medium whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-75">
            Sign out
          </span>
        </button>
      </div>
    </nav>
  )
}
