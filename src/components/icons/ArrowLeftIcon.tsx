// Outline left-arrow icon. Inherits color via currentColor and size/styling via
// the className prop (e.g. "w-4 h-4"). For RTL, rotate it 180° at the call site.
export function ArrowLeftIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" {...props}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
    </svg>
  )
}
