/**
 * Dependent select options.
 *
 * A server FieldSpec may say its choices depend on another field's CURRENT
 * value (`options_depend_on` + `options_by_value`). Nothing here is
 * provider-specific: Tavus `ttsModelName` narrowed by `ttsEngine` is the first
 * user, not the only possible one.
 */
import type { FieldSpec } from '@/types/avatar-template'

type Config = Record<string, unknown>

function isDependent(field: FieldSpec): boolean {
  return field.options_depend_on !== undefined && field.options_by_value !== undefined
}

/**
 * The choices to render right now. A dependent field with no entry for the
 * parent's current value (azure, tavus-auto, unset) has none: the flat
 * `options` union must NOT leak through, or the operator could pick a model the
 * engine cannot use.
 */
export function optionsFor(field: FieldSpec, config: Config): string[] {
  if (!isDependent(field)) return field.options ?? []

  const parent = config[field.options_depend_on as string]

  return typeof parent === 'string' ? (field.options_by_value?.[parent] ?? []) : []
}

/** False only for a dependent field whose parent value offers no choice at all. */
export function dependentOptionsAvailable(field: FieldSpec, config: Config): boolean {
  return !isDependent(field) || optionsFor(field, config).length > 0
}

/**
 * Which dependent fields must be cleared when `changedKey` becomes `newValue`:
 * those that depend on it, currently hold a value, and whose new choice list
 * no longer contains that value.
 */
export function fieldsToResetOnChange(
  specs: FieldSpec[],
  changedKey: string,
  config: Config,
  newValue: unknown
): string[] {
  const next = { ...config, [changedKey]: newValue }

  return specs
    .filter((field) => isDependent(field) && field.options_depend_on === changedKey)
    .filter((field) => {
      const held = config[field.key]

      return held !== undefined && held !== null && !optionsFor(field, next).includes(String(held))
    })
    .map((field) => field.key)
}
