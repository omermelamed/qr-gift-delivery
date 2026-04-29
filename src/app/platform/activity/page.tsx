import { createServiceClient } from '@/lib/supabase/server'

type EventType = 'company_created' | 'user_invited' | 'campaign_launched'

type ActivityEvent = {
  type: EventType
  label: string
  company: string
  timestamp: string
}

const ICONS: Record<EventType, string> = {
  company_created: '🏢',
  user_invited: '👤',
  campaign_launched: '🚀',
}

export default async function ActivityPage() {
  const service = createServiceClient()

  const [{ data: companies }, { data: ucr }, { data: campaigns }] = await Promise.all([
    service
      .from('companies')
      .select('id, name, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
    service
      .from('user_company_roles')
      .select('company_id, created_at, companies(name)')
      .order('created_at', { ascending: false })
      .limit(50),
    service
      .from('campaigns')
      .select('id, name, company_id, sent_at, companies(name)')
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(50),
  ])

  const events: ActivityEvent[] = [
    ...(companies ?? []).map((c) => ({
      type: 'company_created' as const,
      label: `Company "${c.name}" created`,
      company: c.name,
      timestamp: c.created_at,
    })),
    ...(ucr ?? []).map((r) => {
      const co = r.companies as unknown as { name: string } | { name: string }[] | null
      const coName = Array.isArray(co) ? (co[0]?.name ?? '—') : (co?.name ?? '—')
      return {
        type: 'user_invited' as const,
        label: 'New member invited',
        company: coName,
        timestamp: r.created_at,
      }
    }),
    ...(campaigns ?? []).map((c) => {
      const co = c.companies as unknown as { name: string } | { name: string }[] | null
      const coName = Array.isArray(co) ? (co[0]?.name ?? '—') : (co?.name ?? '—')
      return {
        type: 'campaign_launched' as const,
        label: `Campaign "${c.name}" launched`,
        company: coName,
        timestamp: c.sent_at!,
      }
    }),
  ]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 100)

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-zinc-900">Activity</h1>
        <p className="text-sm text-zinc-500 mt-0.5">Recent events across all companies</p>
      </div>

      {events.length === 0 ? (
        <div className="text-center py-16 text-zinc-400 text-sm bg-white rounded-xl border border-zinc-200">
          No activity yet.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {events.map((e, i) => (
            <div key={i} className="bg-white rounded-xl border border-zinc-200 px-5 py-4 flex items-start gap-4">
              <span className="text-xl flex-shrink-0">{ICONS[e.type]}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-zinc-900">{e.label}</p>
                <p className="text-xs text-zinc-400 mt-0.5">{e.company}</p>
              </div>
              <time className="text-xs text-zinc-400 flex-shrink-0 whitespace-nowrap">
                {new Date(e.timestamp).toLocaleString()}
              </time>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
