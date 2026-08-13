/**
 * Static project field bounds (D9).
 *
 * No `/projects/field-specs` endpoint: the project field SET is fixed (unlike
 * avatar-template's provider-varying set), so these bounds are mirrored,
 * verbatim, from `StoreProjectRequest.php` / `UpdateProjectRequest.php`. This
 * is deliberately the ONLY place they are duplicated; if the server-side
 * bounds ever change, this file must change with them, and a server-side 422
 * still catches any drift missed here (client validation is a UX nicety, not
 * the enforcement boundary).
 */

export const PROJECT_FIELD_BOUNDS = {
  pauseEveryNCompetencies: { min: 1, max: 255 },
  nudgeMinChars: { min: 0, max: 65535 },
  urlMaxLength: 2048,
} as const

export function isPauseEveryNCompetenciesValid(value: number | null | undefined): boolean {
  if (value === null || value === undefined) return true
  const { min, max } = PROJECT_FIELD_BOUNDS.pauseEveryNCompetencies
  return value >= min && value <= max
}

export function isNudgeMinCharsValid(value: number | null | undefined): boolean {
  if (value === null || value === undefined) return true
  const { min, max } = PROJECT_FIELD_BOUNDS.nudgeMinChars
  return value >= min && value <= max
}

export function isUrlLengthValid(value: string | null | undefined): boolean {
  if (value === null || value === undefined || value === '') return true
  return value.length <= PROJECT_FIELD_BOUNDS.urlMaxLength
}

/**
 * Mirrors Laravel's `url` rule for `exit_redirect_url` / `webhook_url`, plus
 * the shared 2048 length cap.
 *
 * Empty is valid: both columns are nullable, and an empty field means "no
 * redirect / no webhook", not "invalid input".
 *
 * The scheme check is narrower than Laravel's `url`, which accepts any scheme
 * — deliberately. BEAI only ever *calls* these: a `webhook_url` of
 * `javascript:...` or `file://...` is not a webhook, and an `exit_redirect_url`
 * with a non-http scheme is an open door pointed at the candidate's browser.
 * Being stricter client-side than the server can only reject things the server
 * would have accepted and BEAI could not have used.
 */
export function isProjectUrlValid(value: string | null | undefined): boolean {
  if (value === null || value === undefined || value === '') return true
  if (!isUrlLengthValid(value)) return false

  let parsed: URL
  try {
    parsed = new URL(value)
  } catch {
    // Relative or malformed: `URL` throws without a base, which is the whole
    // point — these fields must be absolute to be dereferenceable off-site.
    return false
  }

  return parsed.protocol === 'http:' || parsed.protocol === 'https:'
}
