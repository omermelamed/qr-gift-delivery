'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'
import { defaultPathForRole } from '@/lib/auth/default-path'
import type { JwtAppMetadata } from '@/types'
import { useT } from '@/lib/i18n/useT'

type Mode = 'signin' | 'forgot' | 'sent'

function LoginForm() {
  const t = useT()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [forgotEmail, setForgotEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const resetSuccess = searchParams.get('reset') === 'success'
  const oauthError = searchParams.get('error')
  const oauthErrorMessage =
    oauthError === 'not_invited'
      ? t("This Google account hasn't been invited. Ask your admin for an invite.")
      : oauthError === 'oauth_failed' || oauthError === 'link_expired'
        ? t('Google sign-in failed. Please try again.')
        : null
  // Only honor same-origin relative paths — reject absolute/protocol-relative
  // URLs so `?next=//evil.com` can't be used as an open redirect (L3).
  const rawNext = searchParams.get('next')
  const nextPath =
    rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') && !rawNext.startsWith('/\\')
      ? rawNext
      : null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data, error: authError } = await supabase.auth.signInWithPassword({ email, password })
      if (authError || !data.user) {
        setError(authError?.message ?? 'Sign in failed')
        return
      }
      const meta = data.user.app_metadata as JwtAppMetadata | undefined
      router.push(nextPath ?? defaultPathForRole(meta?.role_name))
    } finally {
      setLoading(false)
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const supabase = createClient()
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(forgotEmail, {
        redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
      })
      if (resetError) {
        setError(resetError.message)
        return
      }
      setMode('sent')
    } finally {
      setLoading(false)
    }
  }

  async function handleGoogle() {
    setError(null)
    const supabase = createClient()
    const origin = window.location.origin
    const redirectTo = `${origin}/auth/callback${nextPath ? `?next=${encodeURIComponent(nextPath)}` : ''}`
    const { error: oauthErr } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    if (oauthErr) setError(oauthErr.message)
  }

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-8 flex flex-col gap-5">
      {mode === 'signin' && (
        <>
          <h1 className="text-lg font-semibold text-zinc-900">{t('Sign in to your account')}</h1>

          {resetSuccess && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
              {t('Password updated — sign in with your new password.')}
            </p>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          {oauthErrorMessage && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {oauthErrorMessage}
            </p>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium text-zinc-700">{t('Email')}</label>
              <input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-medium text-zinc-700">{t('Password')}</label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all mt-1"
            >
              {loading ? t('Signing in…') : t('Sign in')}
            </button>
          </form>

          <div className="flex items-center gap-3">
            <div className="h-px flex-1 bg-zinc-200" />
            <span className="text-xs text-zinc-400">{t('or')}</span>
            <div className="h-px flex-1 bg-zinc-200" />
          </div>

          <button
            type="button"
            onClick={handleGoogle}
            className="w-full flex items-center justify-center gap-2 border border-zinc-200 rounded-lg px-4 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
            </svg>
            {t('Continue with Google')}
          </button>

          <button
            onClick={() => { setError(null); setForgotEmail(email); setMode('forgot') }}
            className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors text-center"
          >
            {t('Forgot password?')}
          </button>
        </>
      )}

      {mode === 'forgot' && (
        <>
          <h1 className="text-lg font-semibold text-zinc-900">{t('Reset your password')}</h1>
          <p className="text-sm text-zinc-500">{t("Enter your email and we'll send a reset link.")}</p>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <form onSubmit={handleForgot} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="forgot-email" className="text-sm font-medium text-zinc-700">{t('Email')}</label>
              <input
                id="forgot-email"
                type="email"
                placeholder="you@company.com"
                value={forgotEmail}
                onChange={(e) => setForgotEmail(e.target.value)}
                required
                className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50 hover:brightness-110 transition-all"
            >
              {loading ? t('Sending…') : t('Send reset link')}
            </button>
          </form>

          <button
            onClick={() => { setError(null); setMode('signin') }}
            className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors text-center"
          >
            {t('← Back to sign in')}
          </button>
        </>
      )}

      {mode === 'sent' && (
        <>
          <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-lg font-semibold text-zinc-900">{t('Check your email')}</h1>
          <p className="text-sm text-zinc-500">
            {t('We sent a reset link to')} <span className="font-medium text-zinc-700">{forgotEmail}</span>.
            {t('Click the link in the email to set a new password.')}
          </p>
          <button
            onClick={() => setMode('signin')}
            className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors text-center"
          >
            {t('← Back to sign in')}
          </button>
        </>
      )}
    </div>
  )
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-8">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3 mb-8">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500" />
          <span className="text-xl font-bold text-zinc-900">GiftFlow</span>
        </div>

        <Suspense fallback={<div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-8 h-64" />}>
          <LoginForm />
        </Suspense>
      </div>
    </main>
  )
}
