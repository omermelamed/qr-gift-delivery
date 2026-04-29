import { createServiceClient } from '@/lib/supabase/server'

type EventType = 'company_created' | 'user_invited' | 'campaign_launched'

type ActivityEvent = {
  type: EventType
  label: string
  company: string
  timestamp: string
}

function CompanyIcon() {
  return (
    <svg className="w-5 h-5 text-indigo-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  )
}

function UserIcon() {
  return (
    <svg className="w-5 h-5 text-violet-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  )
}

function RocketIcon() {
  return (
    <svg className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  )
}

const ICONS: Record<EventType, React.ReactNode> = {
  company_created: <CompanyIcon />,
  user_invited: <UserIcon />,
  campaign_launched: <RocketIcon />,
}

export default async function ActivityPage() {
  const service = createServiceClient()

  const [{ data: companies }, { data: ucr }, { data: campaigns }] = await Promise.all([
    service
      .from('companies')
      .select('id, name, created_at')
      .order('created_at', { ascending: false }),
    service
      .from('user_company_roles')
      .select('company_id, created_at, companies(name)')
      .order('created_at', { ascending: false }),
    service
      .from('campaigns')
      .select('id, name, company_id, sent_at, companies(name)')
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: false }),
  ])

  const events: ActivityEvent[] = [
    ...(companies ?? []).map((c) => ({
      type: 'company_created' as const,
      label: `Company "${c.name}" created`,
      company: c.name,
      timestamp: c.created_at,
    })),
    ...(ucr ?? []).map((r) => ({
      type: 'user_invited' as const,
      label: 'New member invited',
      company: Array.isArray(r.companies)
        ? (r.companies[0] as { name: string } | undefined)?.name ?? '—'
        : (r.companies as { name: string } | null)?.name ?? '—',
      timestamp: r.created_at,
    })),
    ...(campaigns ?? []).map((c) => ({
      type: 'campaign_launched' as const,
      label: `Campaign "${c.name}" launched`,
      company: Array.isArray(c.companies)
        ? (c.companies[0] as { name: string } | undefined)?.name ?? '—'
        : (c.companies as { name: string } | null)?.name ?? '—',
      timestamp: c.sent_at!,
    })),
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
              {ICONS[e.type]}
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
