'use client'

import { useMemo, useRef, useState, type ComponentProps } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import { useT } from '@/lib/i18n/useT'
import { DatePicker } from '@/components/admin/DatePicker'
import { CampaignPopulator } from '@/components/admin/CampaignPopulator'
import { EmployeeTable } from '@/components/admin/EmployeeTable'
import { DistributorAssignment } from '@/components/admin/DistributorAssignment'
import { GiftOptionsEditor } from '@/components/admin/GiftOptionsEditor'
import { CampaignSmsTemplate } from '@/components/admin/CampaignSmsTemplate'
import { ArrivalCertToggle } from '@/components/admin/ArrivalCertToggle'
import { LaunchButton } from '@/components/admin/LaunchButton'
import { WizardStepper } from '@/components/admin/wizard/WizardStepper'
import {
  clampStep, canAdvance, resolveInitialStep, unmetRequirements,
  WIZARD_STEP_COUNT, type WizardContext,
} from '@/lib/wizard'

type Tokens = ComponentProps<typeof EmployeeTable>['initialRows']

type CampaignWizardProps = {
  campaign: {
    id: string
    name: string
    campaign_date: string | null
    supports_arrival_certificates: boolean
    max_attendee_count: number | null
    sms_template: string | null
    wizard_last_step: number
  }
  tokens: Tokens
  gifts: { id: string; name: string }[]
  creditBalance: number
  companyDefaultTemplate: string | null
  canEditGift: boolean
}

export function CampaignWizard({
  campaign, tokens, gifts, creditBalance, companyDefaultTemplate, canEditGift,
}: CampaignWizardProps) {
  const t = useT()
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // Basics is authoritative in-wizard so gating reacts instantly to typing.
  const [name, setName] = useState(campaign.name)
  const [campaignDate, setCampaignDate] = useState(campaign.campaign_date ?? '')
  const basicsDirty = useRef(false)

  const employeeCount = tokens.length
  const ctx: WizardContext = useMemo(
    () => ({ hasName: name.trim().length > 0, hasDate: !!campaignDate, employeeCount }),
    [name, campaignDate, employeeCount],
  )

  const [step, setStep] = useState(() =>
    resolveInitialStep(searchParams.get('step'), campaign.wizard_last_step, ctx),
  )
  const [advancedOpen, setAdvancedOpen] = useState(campaign.supports_arrival_certificates)

  function persistStep(next: number) {
    const params = new URLSearchParams(searchParams.toString())
    params.set('step', String(next))
    router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    fetch(`/api/campaigns/${campaign.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wizardLastStep: next }),
    }).catch(() => {})
  }

  async function persistBasics() {
    if (!basicsDirty.current) return
    basicsDirty.current = false
    await fetch(`/api/campaigns/${campaign.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), campaignDate }),
    }).catch(() => {})
    router.refresh()
  }

  async function goToStep(next: number) {
    const target = clampStep(next)
    if (step === 1 && target !== 1) await persistBasics()
    setStep(target)
    persistStep(target)
    if (typeof window !== 'undefined') window.scrollTo({ top: 0 })
  }

  const nextDisabled = step < WIZARD_STEP_COUNT && !canAdvance(step, ctx)
  const missing = unmetRequirements(ctx)

  return (
    <div>
      <WizardStepper current={step} ctx={ctx} onJump={goToStep} />

      <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm p-5 md:p-6">
        {step === 1 && (
          <div className="flex flex-col gap-5 max-w-lg">
            <h2 className="text-lg font-semibold text-zinc-900">{t('Basics')}</h2>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="wiz-name" className="text-sm font-medium text-zinc-700">{t('Campaign name')}</label>
              <input
                id="wiz-name" type="text" value={name}
                placeholder={t('e.g. Passover 2026')}
                onChange={(e) => { setName(e.target.value); basicsDirty.current = true }}
                className="border border-zinc-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 ring-brand focus:border-transparent"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="wiz-date" className="text-sm font-medium text-zinc-700">{t('Campaign date')}</label>
              <DatePicker id="wiz-date" value={campaignDate}
                onChange={(v) => { setCampaignDate(v); basicsDirty.current = true }} />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-4">
            <CampaignPopulator
              campaignId={campaign.id}
              existingTokens={tokens.map((tk) => ({ employee_name: tk.employee_name, phone_number: tk.phone_number }))}
            />
            <EmployeeTable
              campaignId={campaign.id} initialRows={tokens} isDraft gifts={gifts}
              canEditGift={canEditGift}
              showAttendance={campaign.supports_arrival_certificates}
              canEditAttendance={canEditGift}
            />
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-4">
            <DistributorAssignment campaignId={campaign.id} />
            <GiftOptionsEditor campaignId={campaign.id} />
          </div>
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            <CampaignSmsTemplate
              campaignId={campaign.id} initial={campaign.sms_template} companyDefault={companyDefaultTemplate}
            />
            <div className="rounded-xl border border-zinc-200">
              <button
                type="button"
                onClick={() => setAdvancedOpen((o) => !o)}
                className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-zinc-700"
                aria-expanded={advancedOpen}
              >
                <span>{t('Advanced settings')}</span>
                <span className={`transition-transform ${advancedOpen ? 'rotate-180' : ''}`}>⌄</span>
              </button>
              {advancedOpen && (
                <div className="px-4 pb-4">
                  <ArrivalCertToggle
                    campaignId={campaign.id}
                    initial={campaign.supports_arrival_certificates}
                    initialMax={campaign.max_attendee_count}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {step === 5 && (
          <div className="flex flex-col gap-5">
            <h2 className="text-lg font-semibold text-zinc-900">{t('Review & Launch')}</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <dt className="text-zinc-500">{t('Campaign name')}</dt><dd className="text-zinc-900">{name || '—'}</dd>
              <dt className="text-zinc-500">{t('Campaign date')}</dt><dd className="text-zinc-900">{campaignDate || '—'}</dd>
              <dt className="text-zinc-500">{t('Employees')}</dt><dd className="text-zinc-900">{employeeCount}</dd>
              <dt className="text-zinc-500">{t('Gift options')}</dt><dd className="text-zinc-900">{gifts.length}</dd>
              <dt className="text-zinc-500">{t('Arrival Certificates')}</dt>
              <dd className="text-zinc-900">{campaign.supports_arrival_certificates ? t('On') : t('Off')}</dd>
            </dl>
            {missing.length > 0 ? (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                {t('Before launching, add:')} {missing.map((m) => t(m)).join(', ')}
              </p>
            ) : (
              <LaunchButton campaignId={campaign.id} employeeCount={employeeCount} creditBalance={creditBalance} />
            )}
          </div>
        )}
      </div>

      {/* Back / Next */}
      <div className="flex items-center justify-between mt-5">
        <button
          type="button"
          onClick={() => goToStep(step - 1)}
          disabled={step === 1}
          className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 hover-brand-text disabled:opacity-40 disabled:cursor-not-allowed"
        >
          ← {t('Back')}
        </button>
        {step < WIZARD_STEP_COUNT && (
          <button
            type="button"
            onClick={() => goToStep(step + 1)}
            disabled={nextDisabled}
            className="rounded-lg px-5 py-2 text-sm font-semibold bg-brand text-white hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {t('Next')} →
          </button>
        )}
      </div>
    </div>
  )
}
