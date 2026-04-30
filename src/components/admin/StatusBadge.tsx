type Props = { sentAt: string | null; closedAt: string | null }

export function StatusBadge({ sentAt, closedAt }: Props) {
  if (closedAt) return <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-zinc-100 text-zinc-500">Closed</span>
  if (sentAt) return <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-green-100 text-green-700">Sent</span>
  return <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-100 text-violet-700">Draft</span>
}
