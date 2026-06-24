// Pure helpers for per-campaign SMS templates.

/** Substitutes {name} and {link} (all occurrences) into a template string. */
export function renderSmsTemplate(template: string, vars: { name: string; link: string }): string {
  return template
    .replaceAll('{name}', vars.name)
    .replaceAll('{link}', vars.link)
}

/**
 * Picks the effective template: campaign override if non-empty, else the company
 * default if non-empty, else null (caller uses the built-in default). Trims, and
 * treats whitespace-only as absent.
 */
export function resolveSmsTemplate(
  campaignTemplate: string | null,
  companyTemplate: string | null,
): string | null {
  const camp = campaignTemplate?.trim()
  if (camp) return camp
  const co = companyTemplate?.trim()
  if (co) return co
  return null
}
