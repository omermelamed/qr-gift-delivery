import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Server-side handler for email auth links (invite / recovery / magic link).
// Email templates point here with ?token_hash=...&type=...&next=... — we verify
// the OTP server-side and set the session cookie, then redirect. This works
// regardless of which browser/device opens the email, unlike the implicit
// `?code=` (PKCE) flow which needs a verifier stored in the originating browser.
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const nextParam = searchParams.get('next') ?? '/'

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
      return NextResponse.redirect(new URL(safeNext, base))
    }
  }

  return NextResponse.redirect(new URL('/login?error=link_expired', base))
}
