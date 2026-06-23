import { type NextRequest, NextResponse } from 'next/server'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { defaultPathForRole } from '@/lib/auth/default-path'
import type { JwtAppMetadata } from '@/types'

// Standard Supabase PKCE OAuth callback. Unlike the email-confirm flow
// (auth/confirm/verify), the same browser starts and finishes here, so the
// `?code=` exchange is safe from email-link prefetchers.
//
// Google is an alternative login for ALREADY-INVITED users only: an invited
// user always has `app_metadata.company_id` (set by the invite route before
// they can log in). A brand-new Google email exchanges fine but has no
// company_id — that orphan is deleted and rejected.
export async function GET(request: NextRequest) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const nextParam = url.searchParams.get('next')

  const base = process.env.NEXT_PUBLIC_APP_URL ?? url.origin
  const redirect = (path: string) => NextResponse.redirect(new URL(path, base), 303)

  if (!code) return redirect('/login?error=oauth_failed')

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)
  if (error) return redirect('/login?error=oauth_failed')

  const { data: { user } } = await supabase.auth.getUser()
  const meta = user?.app_metadata as JwtAppMetadata | undefined

  // Invited-user gate. "Invited" == app_metadata.company_id present.
  if (!meta?.company_id) {
    if (user) {
      const service = createServiceClient()
      // Defense in depth: only delete a genuinely fresh orphan (no company-role
      // row). A user WITH a user_company_roles row was invited — their
      // app_metadata is merely missing/stale, so we reject without destroying
      // the account. This removes reliance on Supabase auto-linking being
      // configured correctly.
      const { data: roleRow } = await service
        .from('user_company_roles')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle()
      if (!roleRow) {
        await service.auth.admin.deleteUser(user.id)
      }
    }
    await supabase.auth.signOut()
    return redirect('/login?error=not_invited')
  }

  // Only allow same-origin relative redirects (no open redirect).
  const safeNext =
    nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//') && !nextParam.startsWith('/\\')
      ? nextParam
      : null

  return redirect(safeNext ?? defaultPathForRole(meta.role_name))
}
