'use client'

import { useT } from '@/lib/i18n/useT'
import { canJumpTo, type WizardContext } from '@/lib/wizard'

const STEP_LABELS = ['Basics', 'Employees', 'Scanners', 'Message', 'Review'] as const

export function WizardStepper({
  current,
  ctx,
  onJump,
}: {
  current: number
  ctx: WizardContext
  onJump: (step: number) => void
}) {
  const t = useT()
  return (
    <nav className="flex items-center gap-1 sm:gap-2 mb-6 overflow-x-auto" aria-label={t('Campaign setup steps')}>
      {STEP_LABELS.map((label, i) => {
        const step = i + 1
        const active = step === current
        const done = step < current
        const reachable = canJumpTo(step, ctx)
        return (
          <div key={label} className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => reachable && onJump(step)}
              aria-current={active ? 'step' : undefined}
              className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-brand text-white'
                  : done
                    ? 'text-brand hover-brand'
                    : reachable
                      ? 'text-zinc-500 hover-brand-text'
                      : 'text-zinc-300 cursor-not-allowed'
              }`}
            >
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-xs ${
                  active ? 'bg-white/20' : done ? 'bg-brand-soft' : 'bg-zinc-100'
                }`}
              >
                {step}
              </span>
              <span className="hidden sm:inline">{t(label)}</span>
            </button>
            {step < STEP_LABELS.length && <span className="text-zinc-200">—</span>}
          </div>
        )
      })}
    </nav>
  )
}
