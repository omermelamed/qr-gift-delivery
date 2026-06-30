import type { NextConfig } from "next";

// Security headers (H5). CSP is intentionally permissive on inline styles/scripts
// because Next's runtime injects them; tighten with nonces later if desired.
//
// connect-src/img-src allow the hosted Supabase wildcard for prod, plus the
// exact origin from NEXT_PUBLIC_SUPABASE_URL so a self-hosted/local Supabase
// (e.g. http://127.0.0.1:54321 for E2E) is reachable without weakening prod.
const supabaseOrigin = (() => {
  try { return process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : '' }
  catch { return '' }
})();
const supabaseWsOrigin = supabaseOrigin.replace(/^http/, 'ws');

const connectSrc = ["'self'", 'https://*.supabase.co', 'wss://*.supabase.co', supabaseOrigin, supabaseWsOrigin].filter(Boolean).join(' ');
const imgSrc = ["'self'", 'data:', 'blob:', 'https://*.supabase.co', supabaseOrigin].filter(Boolean).join(' ');

// React dev mode uses eval() for debugging; production never does. Allow
// 'unsafe-eval' only in development so prod CSP stays strict.
const isDev = process.env.NODE_ENV !== 'production';
const scriptSrc = ["'self'", "'unsafe-inline'", ...(isDev ? ["'unsafe-eval'"] : [])].join(' ');

const ContentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  `img-src ${imgSrc}`,
  `connect-src ${connectSrc}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: ContentSecurityPolicy },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Scanner UI needs the camera; everything else is denied.
  { key: 'Permissions-Policy', value: 'camera=(self), microphone=(), geolocation=()' },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
