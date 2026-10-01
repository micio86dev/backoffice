/**
 * Avatar-template picker rules (global-avatar-templates, B1).
 *
 * Pure, so the rules the ProjectForm needs are testable without mounting it.
 * `scope` is the API's word for who owns a template: `organization` (the
 * caller's own) or `platform` (a global every organization may pin). A missing
 * `scope` reads as `organization`, the only value there was before globals.
 */
import type { TemplateOption } from '../types/avatar-template'

export function isPlatformTemplate(option: Pick<TemplateOption, 'scope'>): boolean {
  return option.scope === 'platform'
}

/**
 * The template to preselect for a project that has not chosen one.
 *
 * Own ACTIVE first, then the first ACTIVE global, else nothing. An inactive
 * template is never preselected (it is legal to pin, but not a default), and a
 * global is never preselected while the organization has an active template of
 * its own.
 */
export function pickDefaultTemplate(options: TemplateOption[]): TemplateOption | null {
  const active = options.filter((option) => option.is_active)

  return (
    active.find((option) => !isPlatformTemplate(option)) ??
    active.find((option) => isPlatformTemplate(option)) ??
    null
  )
}

export interface TemplateGroups {
  own: TemplateOption[]
  platform: TemplateOption[]
}

/**
 * Splits the options into the two picker groups, API order kept inside each.
 *
 * A RETIRED global (`is_active = false`) is not a choice for a new pin, so it is
 * dropped unless it is the project's current pin: that one must stay visible and
 * selectable, or the unchanged pin could not be re-submitted. Inactive OWN
 * templates stay: pinning one is how a project opts out of the org-wide default.
 */
export function groupTemplateOptions(
  options: TemplateOption[],
  currentPinId: number | null
): TemplateGroups {
  const own: TemplateOption[] = []
  const platform: TemplateOption[] = []

  for (const option of options) {
    if (!isPlatformTemplate(option)) {
      own.push(option)
    } else if (option.is_active || option.id === currentPinId) {
      platform.push(option)
    }
  }

  return { own, platform }
}
