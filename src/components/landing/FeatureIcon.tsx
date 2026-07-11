import type { ReactNode } from 'react'

export type FeatureIconName = 'scan' | 'activity' | 'phone' | 'users' | 'globe' | 'chart'

// Lucide-style inline line icons (24×24, stroke currentColor).
const PATHS: Record<FeatureIconName, ReactNode> = {
  scan: (
    <>
      <path className="scan-l" d="M3 7V5a2 2 0 0 1 2-2h2" />
      <path className="scan-r" d="M17 3h2a2 2 0 0 1 2 2v2" />
      <path className="scan-r" d="M21 17v2a2 2 0 0 1-2 2h-2" />
      <path className="scan-l" d="M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M7 12h10" opacity="0.5" />
    </>
  ),
  activity: <path className="pulse-line" d="M22 12h-4l-3 9L9 3l-3 9H2" />,
  phone: (
    <>
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path className="ring-dot" d="M12 18h.01" />
    </>
  ),
  users: (
    <>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle className="ring-dot" cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" opacity="0.6" />
      <path
        className="globe-ring"
        d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"
      />
    </>
  ),
  chart: (
    <>
      <path d="M3 3v18h18" />
      <path className="bar bar1" d="M7 13v5" />
      <path className="bar bar2" d="M12 8v10" />
      <path className="bar bar3" d="M17 11v7" />
    </>
  ),
}

export function FeatureIcon({ name }: { name: FeatureIconName }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
