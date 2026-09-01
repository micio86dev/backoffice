/**
 * Avatar template shapes (C14).
 *
 * DERIVED from the generated client wherever the generator gets it right, and
 * narrowed — with a reason — in the two places it cannot.
 *
 * Scramble infers the response envelope, the ids, the names and the timestamps
 * correctly, so those come from `paths` and stay correct for free. It cannot
 * infer:
 *
 *   - `config`, which it reports as `unknown[]`. PHP has one `array` type for
 *     both lists and maps, and this one is a MAP. Adopting the generated type
 *     would mean the client believing an object is an array — worse than a
 *     hand-written type, because it is confidently wrong rather than absent.
 *
 *   - `provider`, which it reports as `string`. The union lives in a PHP
 *     `match` and a database CHECK, neither of which reaches OpenAPI.
 *
 * Both narrowings are `Omit` + re-add rather than a parallel definition, so
 * every OTHER field still tracks the API automatically. If a field is added
 * server-side it appears here without an edit; if one is removed, this file
 * stops compiling.
 *
 * A third narrowing, `description`, was added by `backoffice-missing-pages`:
 * regenerating `types/api.ts` from the api's post-C11-slices `openapi.json`
 * (task: "regenerate the backoffice typed client" first step) revealed that
 * Scramble's nullability inference regressed ACROSS THE WHOLE export, not
 * just the new endpoints — every `?string` PHP property that used to render
 * as `string | null` (this one included) now renders as plain `string`. This
 * is a pre-existing upstream (`api` submodule) regression, not something
 * introduced here; it is flagged, not silently patched into the generated
 * file. `AvatarTemplateForm.vue:278` deliberately sends `null` to clear the
 * description, so the local type is re-widened here rather than the runtime
 * behavior changed.
 */

import type { components, paths } from '../../types/api'

export type ProviderName = 'heygen' | 'tavus'

export type FieldType = 'text' | 'number' | 'select' | 'checkbox'

/**
 * One configurable knob, as the API describes it.
 *
 * Hand-written, because the endpoint returns a provider-keyed map of arbitrary
 * field descriptors and Scramble types it as `data: string`. There is nothing
 * to derive from.
 *
 * The form is BUILT from these rather than hand-written, so a knob added
 * server-side appears without a frontend change — and a knob the server does
 * not know about cannot appear at all.
 */
export interface FieldSpec {
  key: string
  type: FieldType
  label_key: string
  /** i18n key for the one-line explanation shown under the control. */
  hint_key?: string
  required?: boolean
  options?: string[]
  min?: number
  max?: number
  step?: number
}

export type FieldSpecsResponse = {
  data: Record<ProviderName, FieldSpec[]>
}

type GeneratedTemplate = components['schemas']['AvatarTemplateResource']

export type AvatarTemplate = Omit<GeneratedTemplate, 'config' | 'provider' | 'description'> & {
  config: Record<string, unknown>
  provider: ProviderName
  description: string | null
}

/**
 * A single template response.
 *
 * `warning` carries a STABLE CODE when the persona sync did not reach the
 * provider — never the provider's own words. The save itself succeeded; the
 * operator needs to know a knob has not taken effect yet, and telling them in
 * the vendor's language would name the vendor.
 *
 * Absent from the generated schema because it is conditional: Scramble sees the
 * resource, not the `additional()` an unhappy path attaches.
 */
export interface TemplateResponse {
  data: AvatarTemplate
  warning?: string
}

export type TemplateListResponse = Omit<
  paths['/avatar-templates']['get']['responses']['200']['content']['application/json'],
  'data'
> & { data: AvatarTemplate[] }

/**
 * The picker list. DERIVED from the generated client, not hand-written — the
 * point of this endpoint is that its shape cannot quietly grow, and a
 * hand-written copy here would be free to.
 */
export type TemplateOption =
  paths['/avatar-templates/options']['get']['responses']['200']['content']['application/json']['data'][number]

export type TemplateOptionsResponse =
  paths['/avatar-templates/options']['get']['responses']['200']['content']['application/json']
