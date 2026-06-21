import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Verifies the email OTP and sets the session cookie, then redirects to `next`.
// Reached only via the explicit POST from the /auth/confirm interstitial form —
// email link prefetchers issue GET requests and never submit the form, so the
// single-use token survives until the real user clicks. This works regardless of
// which browser/device opens the email, unlike the implicit `?code=` (PKCE) flow.
export async function POST(request: NextRequest) {
  const form = await request.formData()
  const tokenHash = form.get('token_hash')?.toString() ?? null
  const type = (form.get('type')?.toString() ?? null) as EmailOtpType | null
  const nextParam = form.get('next')?.toString() ?? '/'

  const base = process.env.NEXT_PUBLIC_APP_URL ?? new URL(request.url).origin
  // Only allow same-origin relative redirects (no open redirect).
  const safeNext =
    nextParam.startsWith('/') && !nextParam.startsWith('//') && !nextParam.startsWith('/\\')
      ? nextParam
      : '/'

  if (tokenHash && type) {
    const supabase = await createClient()
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash })
    if (!error) {
      // 303 so the browser follows the redirect with GET after the POST.
      return NextResponse.redirect(new URL(safeNext, base), 303)
    }
  }

  return NextResponse.redirect(new URL('/login?error=link_expired', base), 303)
}
