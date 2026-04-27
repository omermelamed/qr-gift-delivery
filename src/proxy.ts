import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  let proxyResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          // Update request cookies so NextResponse.next({ request }) sees them
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          proxyResponse = NextResponse.next({ request })
          // Write full options (Secure, HttpOnly, etc.) to the response
          cookiesToSet.forEach(({ name, value, options }) =>
            proxyResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const { pathname } = request.nextUrl

  if (!user) {
    if (pathname.startsWith('/api/campaigns')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (pathname.startsWith('/scan') || pathname.startsWith('/admin')) {
      return NextResponse.redirect(new URL('/login', request.url))
    }
  }

  return proxyResponse
}

export const config = {
  matcher: ['/scan/:path*', '/admin/:path*', '/api/campaigns', '/api/campaigns/:path*'],
}
