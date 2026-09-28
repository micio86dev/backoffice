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
 *
 * `CatalogueEntry`/`CatalogueResponse` are hand-written for a different reason:
 * the catalogue path IS in the generated client (its query types are derived
 * from it below), but Scramble reports the response body as
 * `{status: string, items: unknown[], code?: string}` because the payload is
 * assembled from provider responses. See each type's own docblock.
 */

import type { components, paths } from '../../types/api'

export type ProviderName = 'heygen' | 'tavus'

type CatalogueQuery = NonNullable<
  paths['/avatar-templates/catalogue']['get']['parameters']['query']
>

export type FieldType = 'text' | 'number' | 'select' | 'checkbox'

/**
 * Which provider catalogue resource a field's picker draws from
 * (avatar-template-catalogue design D2). Present on exactly `avatarId`/
 * `voiceId` (heygen) and `faceId`/`palId` (tavus); absent — never `null` —
 * on every other field, including `ttsExternalVoiceId`.
 */
export type CatalogueResource = CatalogueQuery['resource']

/**
 * Which service a catalogue list is fetched from. Wider than `ProviderName`:
 * a Tavus template can speak with a third-party voice, and that voice picker
 * queries the third party's own catalogue (`cartesia` / `elevenlabs`).
 */
export type CatalogueProvider = CatalogueQuery['provider']

/** Third-party speech engines whose voices the API can list. */
export const CATALOGUED_TTS_ENGINES = ['cartesia', 'elevenlabs'] as const

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
  catalogue_resource?: CatalogueResource
}

/**
 * One provider catalogue entry.
 *
 * Hand-written narrowing: Scramble reports the catalogue body as
 * `{status: string, items: unknown[], code?: string}` because the payload is
 * assembled from provider responses, not from a typed resource. The request
 * query (`CatalogueProvider` / `CatalogueResource`) IS derived from the
 * generated client above, so a provider or resource added server-side breaks
 * this file's compile instead of drifting.
 *
 * `language`, `locale`, `accent` and the preview URLs are `null`, never a
 * guess, when the provider's resource carries no such attribute. `italian` is
 * the API's own classification: `native` for an Italian voice, `multilingual`
 * for a voice that can speak Italian, `null` otherwise.
 */
export interface CatalogueEntry {
  id: string
  provider: CatalogueProvider
  label: string
  name: string
  language: string | null
  locale: string | null
  accent: string | null
  italian: 'native' | 'multilingual' | null
  preview_image_url: string | null
  preview_audio_url: string | null
  /** Tavus faces only. */
  preview_video_url: string | null
}

export type CatalogueStatus = 'ok' | 'empty' | 'provider_error'

/** Stable codes the API attaches to `provider_error`. Never the vendor's words. */
export type CatalogueErrorCode =
  | 'provider_key_missing'
  | 'provider_unauthorized'
  | 'provider_rate_limited'
  | 'provider_unavailable'
  | 'provider_unreachable'
  | 'provider_rejected'
  | 'provider_bad_response'
  | 'unsupported_catalogue'

/**
 * A catalogue answer is always HTTP 200: a provider failure is a `status`, not
 * an exception, so the picker can say WHY it is empty instead of showing a
 * blank list that reads as a bug.
 */
export interface CatalogueResponse {
  status: CatalogueStatus
  items: CatalogueEntry[]
  code?: CatalogueErrorCode
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
