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
