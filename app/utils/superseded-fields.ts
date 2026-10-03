/**
 * Superseded fields.
 *
 * A server FieldSpec may say it is REPLACED by another field's value
 * (`superseded_by_key` + `superseded_by_values`): the HeyGen native `voiceId`
 * when a Cartesia or ElevenLabs engine supplies the voice instead. The API
 * refuses such a field beside its replacement (`superseded_by_*`) and does not
 * require it, so the form hides it and drops its value rather than offering a
 * control that can only be refused. Nothing here is provider-specific.
 */
import type { FieldSpec } from '@/types/avatar-template'

type Config = Record<string, unknown>

/** True while the governing field currently holds a value that replaces `field`. */
export function isSuperseded(field: FieldSpec, config: Config): boolean {
  if (field.superseded_by_key === undefined || field.superseded_by_values === undefined) {
    return false
  }

  const governing = config[field.superseded_by_key]

  return typeof governing === 'string' && field.superseded_by_values.includes(governing)
}

/**
 * Which held values must be dropped when `changedKey` becomes `newValue`:
 * fields that hold a value and are superseded by the new one.
 */
export function fieldsToDropWhenChanged(
  specs: FieldSpec[],
  changedKey: string,
  config: Config,
  newValue: unknown
): string[] {
  const next = { ...config, [changedKey]: newValue }

  return specs
    .filter((field) => field.superseded_by_key === changedKey && isSuperseded(field, next))
    .filter((field) => config[field.key] !== undefined && config[field.key] !== null)
    .map((field) => field.key)
}
