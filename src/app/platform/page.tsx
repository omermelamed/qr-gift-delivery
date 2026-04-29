import Link from 'next/link'
import { createServiceClient } from '@/lib/supabase/server'
import { NewCompanyButton } from '@/components/platform/NewCompanyButton'

export default async function PlatformPage() {
  const service = createServiceClient()

  const [{ data: companies }, { data: ucrRows }, { data: campaignRows }] = await Promise.all([
    service.from('companies').select('id, name, slug, created_at').order('created_at', { ascending: false }),
    service.from('user_company_roles').select('company_id'),
    service.from('campaigns').select('company_id'),
  ])

  const memberCountMap: Record<string, number> = {}
  for (const r of ucrRows ?? []) {
    memberCountMap[r.company_id] = (memberCountMap[r.company_id] ?? 0) + 1
  }

  const campaignCountMap: Record<string, number> = {}
  for (const r of campaignRows ?? []) {
    campaignCountMap[r.company_id] = (campaignCountMap[r.company_id] ?? 0) + 1
  }

  const list = companies ?? []

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Companies</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{list.length} total</p>
        </div>
        <NewCompanyButton />
      </div>

      {list.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl border border-zinc-200">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 mx-auto mb-4" />
          <p className="text-zinc-900 font-semibold mb-1">No companies yet</p>
          <p className="text-sm text-zinc-500">Create your first client company to get started.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-zinc-200 overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-xs text-zinc-400 border-b border-zinc-100">
                <th className="px-5 py-3 font-medium">Company</th>
                <th className="px-5 py-3 font-medium">Members</th>
                <th className="px-5 py-3 font-medium">Campaigns</th>
                <th className="px-5 py-3 font-medium">Created</th>
              </tr>
            </thead>
            <tbody>
              {list.map((co) => (
                <tr key={co.id} className="border-b border-zinc-50 hover:bg-zinc-50">
                  <td className="px-5 py-3">
                    <Link
                      href={`/platform/companies/${co.id}`}
                      className="font-medium text-zinc-900 hover:text-indigo-600 transition-colors"
                    >
                      {co.name}
                    </Link>
                    <p className="text-xs text-zinc-400 font-mono">{co.slug}</p>
                  </td>
                  <td className="px-5 py-3 text-zinc-600">{memberCountMap[co.id] ?? 0}</td>
                  <td className="px-5 py-3 text-zinc-600">{campaignCountMap[co.id] ?? 0}</td>
                  <td className="px-5 py-3 text-zinc-500 text-xs">
                    {new Date(co.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
