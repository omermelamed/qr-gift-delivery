'use client'

import { Suspense, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/browser'
import type { JwtAppMetadata } from '@/types'

type Mode = 'signin' | 'forgot' | 'sent'

function LoginForm() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [forgotEmail, setForgotEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const resetSuccess = searchParams.get('reset') === 'success'

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
      router.push(meta?.role_name === 'scanner' ? '/scan' : '/admin')
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

  return (
    <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-8 flex flex-col gap-5">
      {mode === 'signin' && (
        <>
          <h1 className="text-lg font-semibold text-zinc-900">Sign in to your account</h1>

          {resetSuccess && (
            <p className="text-sm text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
              Password updated — sign in with your new password.
            </p>
          )}

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-medium text-zinc-700">Email</label>
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
              <label htmlFor="password" className="text-sm font-medium text-zinc-700">Password</label>
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
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <button
            onClick={() => { setError(null); setForgotEmail(email); setMode('forgot') }}
            className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors text-center"
          >
            Forgot password?
          </button>
        </>
      )}

      {mode === 'forgot' && (
        <>
          <h1 className="text-lg font-semibold text-zinc-900">Reset your password</h1>
          <p className="text-sm text-zinc-500">Enter your email and we'll send a reset link.</p>

          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <form onSubmit={handleForgot} className="flex flex-col gap-5">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="forgot-email" className="text-sm font-medium text-zinc-700">Email</label>
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
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </form>

          <button
            onClick={() => { setError(null); setMode('signin') }}
            className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors text-center"
          >
            ← Back to sign in
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
          <h1 className="text-lg font-semibold text-zinc-900">Check your email</h1>
          <p className="text-sm text-zinc-500">
            We sent a reset link to <span className="font-medium text-zinc-700">{forgotEmail}</span>.
            Click the link in the email to set a new password.
          </p>
          <button
            onClick={() => setMode('signin')}
            className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors text-center"
          >
            ← Back to sign in
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
