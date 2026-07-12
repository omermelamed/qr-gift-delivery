import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

// Routes that don't need authentication.
// '/auth' covers the email-link confirmation route (/auth/confirm), which runs
// BEFORE a session exists — it's the handler that establishes the session.
const PUBLIC_PREFIXES = ['/login', '/reset-password', '/verify', '/gift', '/auth']

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // The marketing landing page is public. Exact match — a '/' prefix would
  // open every route.
  if (pathname === '/') {
    return NextResponse.next()
  }

  // Pass through public routes
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  const allCookies = request.cookies.getAll()

  // Optimistic check: Supabase SSR stores the session under 'supabase.auth.token'
  // (possibly chunked as 'supabase.auth.token.0', '.1', etc.)
  // We avoid any network call here — the admin layout does the real auth check in Node.js.
  const hasSession = allCookies.some(c =>
    c.name.startsWith('supabase.auth.token') ||
    c.name.includes('-auth-token') ||
    c.name.startsWith('sb-')
  )

  if (!hasSession) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|woff2?)$).*)',
  ],
}
