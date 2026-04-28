import Link from 'next/link'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const appMeta = user!.app_metadata as JwtAppMetadata

  const service = createServiceClient()
  const { data: campaigns } = await service
    .from('campaigns')
    .select('id, name, campaign_date, sent_at')
    .eq('company_id', appMeta.company_id)
    .order('created_at', { ascending: false })

  const list = campaigns ?? []

  return (
    <main className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Campaigns</h1>
        <Link
          href="/admin/campaigns/new"
          className="bg-black text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition-colors"
        >
          New Campaign
        </Link>
      </div>

      {list.length === 0 ? (
        <p className="text-gray-500">No campaigns yet. Create your first one.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {list.map((c) => (
            <Link
              key={c.id}
              href={`/admin/campaigns/${c.id}`}
              className="border rounded-xl p-5 bg-white hover:shadow transition-shadow flex items-center justify-between"
            >
              <div>
                <p className="font-semibold">{c.name}</p>
                <p className="text-sm text-gray-500">{c.campaign_date ?? '—'}</p>
              </div>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                c.sent_at ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
              }`}>
                {c.sent_at ? 'Sent' : 'Draft'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
