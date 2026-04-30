import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import type { JwtAppMetadata } from '@/types'
import { DuplicateCampaignButton } from '@/components/admin/DuplicateCampaignButton'
import { StatusBadge } from '@/components/admin/StatusBadge'

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const appMeta = user.app_metadata as JwtAppMetadata

  const service = createServiceClient()
  const { data: campaigns } = await service
    .from('campaigns')
    .select('id, name, campaign_date, sent_at, closed_at')
    .eq('company_id', appMeta.company_id)
    .order('created_at', { ascending: false })

  const list = campaigns ?? []

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Campaigns</h1>
          <p className="text-sm text-zinc-500 mt-0.5">{list.length} total</p>
        </div>
        <Link
          href="/admin/campaigns/new"
          className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:brightness-110 transition-all"
        >
          + New Campaign
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="text-center py-24 bg-white rounded-2xl border border-zinc-200">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-500 mx-auto mb-4" />
          <p className="text-zinc-900 font-semibold mb-1">No campaigns yet</p>
          <p className="text-sm text-zinc-500 mb-6">Create your first campaign to get started</p>
          <Link
            href="/admin/campaigns/new"
            className="bg-gradient-to-r from-indigo-500 to-violet-500 text-white rounded-lg px-4 py-2 text-sm font-semibold hover:brightness-110 transition-all"
          >
            + New Campaign
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((c) => (
            <Link
              key={c.id}
              href={`/admin/campaigns/${c.id}`}
              className="bg-white border border-zinc-200 rounded-xl p-5 hover:shadow-md transition-shadow flex items-center justify-between group"
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className="min-w-0">
                  <p className="font-semibold text-zinc-900 group-hover:text-indigo-600 transition-colors truncate">
                    {c.name}
                  </p>
                  <p className="text-sm text-zinc-400 mt-0.5">{c.campaign_date ?? '—'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <DuplicateCampaignButton
                  campaignId={c.id}
                  sourceName={c.name}
                  sourceDate={c.campaign_date}
                />
                <StatusBadge sentAt={c.sent_at} closedAt={c.closed_at} />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
