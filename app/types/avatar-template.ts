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
 * `CatalogueEntry`/`CatalogueResponse` (avatar-template-catalogue PR4) are a
 * DIFFERENT kind of gap from the three above: not a narrowing of a generated
 * type, but a type with NO generated counterpart at all yet, because
 * `GET /avatar-templates/catalogue` postdates this repo's last `openapi.json`
 * regeneration. See each type's own docblock for the exact commit and the
 * condition under which it should stop being hand-written.
 */

import type { components, paths } from '../../types/api'

export type ProviderName = 'heygen' | 'tavus'

export type FieldType = 'text' | 'number' | 'select' | 'checkbox'

/**
 * Which provider catalogue resource a field's picker draws from
 * (avatar-template-catalogue design D2). Present on exactly `avatarId`/
 * `voiceId` (heygen) and `faceId`/`palId` (tavus); absent — never `null` —
 * on every other field, including `ttsExternalVoiceId`.
 */
export type CatalogueResource = 'voice' | 'avatar' | 'replica'

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
 * One provider catalogue entry (avatar-template-catalogue design D1/D4).
 *
 * `language` is `null`, never a guess, when the provider's own resource
 * carries no language attribute (Tavus's voices and replicas today) — a
 * language filter MUST NOT treat `null` as matching everything.
 *
 * UNLIKE `config`/`provider`/`description` above, this is not a narrowing of
 * a generated type — there is NOTHING to narrow. `GET
 * /avatar-templates/catalogue` was added on the `api` submodule's own
 * `feature/avatar-template-catalogue-pr1` branch (commit `22a76a2`), which
 * regenerated `api/openapi.json` there, but this repo's own
 * `openapi.json`/`types/api.ts` snapshot is regenerated from a COPY of that
 * file (`bun run codegen`) and was last refreshed 2026-09-21 — before PR1
 * existed. `types/api.ts` carries zero trace of this endpoint (confirmed:
 * `rg -c "avatar-templates/catalogue" openapi.json` → 0 matches), so this
 * type has none of the drift protection `codegen:check` gives every other
 * response shape in this file. Revisit once `api`'s PR1 branch merges to
 * `develop` and this repo's `openapi.json`/`types/api.ts` are regenerated
 * against it — at that point this SHOULD become an `Omit`+re-add over the
 * generated schema, matching the pattern above, not stay hand-written.
 */
export interface CatalogueEntry {
  id: string
  label: string
  language: string | null
  preview_image_url: string | null
  preview_audio_url: string | null
}

/**
 * `status: 'unavailable'` is a degraded-but-successful response (D3): a
 * provider failure or cache miss-then-fail never throws, it returns an empty
 * list the picker renders as an honest "catalogue unavailable" hint rather
 * than a blank list that reads as a bug.
 *
 * Hand-written for the same reason as `CatalogueEntry` immediately above —
 * no generated counterpart exists yet for this endpoint.
 */
export interface CatalogueResponse {
  status: 'ok' | 'unavailable'
  items: CatalogueEntry[]
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
