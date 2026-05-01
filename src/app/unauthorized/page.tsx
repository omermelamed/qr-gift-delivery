import Link from 'next/link'

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 p-8">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto mb-6">
          <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <p className="text-xs font-bold tracking-widest text-red-400 uppercase mb-2">401 — Unauthorized</p>
        <h1 className="text-2xl font-bold text-zinc-900 mb-3">Access denied</h1>
        <p className="text-sm text-zinc-500 mb-8">
          You don't have permission to view this page. Contact your administrator if you think this is a mistake.
        </p>
        <Link
          href="/admin"
          className="inline-block text-white text-sm font-semibold rounded-lg px-5 py-2.5 hover:brightness-110 transition-all"
          style={{ backgroundColor: 'var(--brand, #6366f1)' }}
        >
          Go to dashboard
        </Link>
      </div>
    </main>
  )
}
