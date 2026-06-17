'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

type Company = {
  id: string
  name: string
  slug: string
  active: boolean
  created_at: string
}

export function CompaniesUI({ initialCompanies }: { initialCompanies: Company[] }) {
  const [companies, setCompanies] = useState<Company[]>(initialCompanies)
  const [showCreate, setShowCreate] = useState(false)
  const router = useRouter()

  async function handleToggle(company: Company) {
    const res = await fetch(`/api/platform/companies/${company.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !company.active }),
    })
    if (res.ok) {
      setCompanies(cs => cs.map(c => c.id === company.id ? { ...c, active: !c.active } : c))
    }
  }

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Companies</h1>
          <p className="text-sm text-zinc-500 mt-1">{companies.length} companies on the platform</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-indigo-700 transition-colors"
        >
          + New Company
        </button>
      </div>

      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50">
              <th className="text-left px-5 py-3 font-semibold text-zinc-500 text-xs uppercase tracking-wide">Company</th>
              <th className="text-left px-5 py-3 font-semibold text-zinc-500 text-xs uppercase tracking-wide">Slug</th>
              <th className="text-left px-5 py-3 font-semibold text-zinc-500 text-xs uppercase tracking-wide">Created</th>
              <th className="text-left px-5 py-3 font-semibold text-zinc-500 text-xs uppercase tracking-wide">Status</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody>
            {companies.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center py-16 text-zinc-400">No companies yet. Create one to get started.</td>
              </tr>
            )}
            {companies.map(company => (
              <tr key={company.id} className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50 transition-colors">
                <td className="px-5 py-4 font-medium text-zinc-900">{company.name}</td>
                <td className="px-5 py-4 text-zinc-500 font-mono text-xs">{company.slug}</td>
                <td className="px-5 py-4 text-zinc-500">{new Date(company.created_at).toLocaleDateString()}</td>
                <td className="px-5 py-4">
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    company.active
                      ? 'bg-green-50 text-green-700'
                      : 'bg-zinc-100 text-zinc-500'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${company.active ? 'bg-green-500' : 'bg-zinc-400'}`} />
                    {company.active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-5 py-4 text-right">
                  <button
                    onClick={() => handleToggle(company)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                      company.active
                        ? 'border-red-200 text-red-600 hover:bg-red-50'
                        : 'border-green-200 text-green-700 hover:bg-green-50'
                    }`}
                  >
                    {company.active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateCompanyModal
          onClose={() => setShowCreate(false)}
          onCreated={(c) => {
            setCompanies(cs => [c, ...cs])
            setShowCreate(false)
          }}
        />
      )}
    </div>
  )
}

function CreateCompanyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void
  onCreated: (c: Company) => void
}) {
  const [name, setName] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toSlug(n: string) {
    return n.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/platform/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), adminEmail: adminEmail.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to create company')
        return
      }
      onCreated({
        id: data.companyId,
        name: name.trim(),
        slug: toSlug(name.trim()),
        active: true,
        created_at: new Date().toISOString(),
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-zinc-900">New Company</h2>
          <button onClick={onClose} className="text-zinc-400 hover:text-zinc-600 transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2 mb-4">{error}</p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700">Company name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              required
              placeholder="Acme Corp"
              className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            {name && (
              <p className="text-xs text-zinc-400">Slug: {toSlug(name)}</p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-zinc-700">Admin email</label>
            <input
              type="email"
              value={adminEmail}
              onChange={e => setAdminEmail(e.target.value)}
              required
              placeholder="admin@acme.com"
              className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            <p className="text-xs text-zinc-400">An invite email will be sent to this address.</p>
          </div>

          <div className="flex gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 border border-zinc-200 rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-indigo-600 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Creating…' : 'Create Company'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
