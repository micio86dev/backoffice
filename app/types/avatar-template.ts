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
 *     The generated WRITE bodies (POST/PATCH) say `string[]` for the same
 *     reason, while the read resource says an object; the api validates it as a
 *     plain array/map. Pinned in `tests/nuxt/avatar-template-config-contract.ts`
 *     (types) and `avatar-template-config-shape.spec.ts` (runtime). Follow-up:
 *     annotate the api request rules so Scramble emits an object schema.
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
 * `CatalogueEntry`/`CatalogueResponse` are derived like the rest: `provider`,
 * `italian`, `status`, `items` and `code` are re-narrowed to their closed sets
 * (Scramble types them as plain strings), and each hand-written set is pinned
 * to the api source by `tests/unit/avatar-template-catalogue-api-shape.spec.ts`.
 * See each type's own docblock.
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
 * Every external speech engine a Tavus template can bind: the catalogued ones
 * plus Azure, which has no voice catalogue. The single list the form reads.
 */
export const EXTERNAL_TTS_ENGINES = [...CATALOGUED_TTS_ENGINES, 'azure'] as const

type FieldSpecsBody =
  paths['/avatar-templates/field-specs']['get']['responses']['200']['content']['application/json']

/**
 * One configurable knob, as the API describes it. DERIVED from the generated
 * field-specs response; only the two members Scramble types as plain strings
 * (`type`, `catalogue_resource`) are re-narrowed to their closed sets.
 *
 * The form is BUILT from these rather than hand-written, so a knob added
 * server-side appears without a frontend change — and a knob the server does
 * not know about cannot appear at all.
 */
export type FieldSpec = Omit<
  FieldSpecsBody['data']['heygen'][number],
  'type' | 'catalogue_resource'
> & {
  type: FieldType
  /**
   * Which provider catalogue resource the field's picker draws from
   * (avatar-template-catalogue design D2). Present on exactly `avatarId`/
   * `voiceId` (heygen) and `faceId`/`palId` (tavus); absent on every other field.
   */
  catalogue_resource?: CatalogueResource
}

type CatalogueBody =
  paths['/avatar-templates/catalogue']['get']['responses']['200']['content']['application/json']
type GeneratedCatalogueEntry = CatalogueBody['data']['items'][number]

/**
 * One provider catalogue entry. DERIVED from the generated catalogue response;
 * only the two members Scramble types as plain strings are re-narrowed to their
 * closed sets: `provider` (the service the entry came from) and `italian`.
 *
 * `language`, `locale`, `accent` and the preview URLs are `null`, never a
 * guess, when the provider's resource carries no such attribute. `italian` is
 * the API's own classification: `native` for an Italian voice, `multilingual`
 * for a voice that can speak Italian, `null` otherwise. The request query
 * (`CatalogueProvider` / `CatalogueResource`) is derived from the same client,
 * so a provider or resource added server-side breaks this file's compile
 * instead of drifting.
 *
 * `preview_audio_url` is a PUBLIC audio url the browser may play itself
 * (ElevenLabs), never a key-gated vendor url; `preview_audio_via_api` is `true`
 * when the vendor's clip needs the platform key (Cartesia), so the api serves
 * its bytes at `GET /avatar-templates/catalogue-sample`. `editable` is on Tavus
 * personas only: `true` = one of the account's own personas, `false` = a Tavus
 * stock persona whose voice/persona settings Tavus refuses to modify,
 * `null`/absent = unknown, which is never treated as editable.
 */
export type CatalogueEntry = Omit<GeneratedCatalogueEntry, 'provider' | 'italian'> & {
  provider: CatalogueProvider
  italian: 'native' | 'multilingual' | null
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
export type CatalogueResponse = Omit<CatalogueBody['data'], 'status' | 'items' | 'code'> & {
  status: CatalogueStatus
  items: CatalogueEntry[]
  code?: CatalogueErrorCode
}

/** The `{data}` envelope `GET /avatar-templates/catalogue` answers with. */
export type CatalogueEnvelope = Omit<CatalogueBody, 'data'> & { data: CatalogueResponse }

export type FieldSpecsResponse = Omit<FieldSpecsBody, 'data'> & {
  data: Record<ProviderName, FieldSpec[]>
}

type GeneratedTemplate = components['schemas']['AvatarTemplateResource']

/**
 * Stable codes a Tavus persona sync can end in when it did not fully apply
 * (`pal_sync.code`, and the save response's top-level `warning`). Never the
 * vendor's words. Every code needs copy in both locales: the guard in
 * `pal-sync-i18n.spec.ts` derives from this list.
 *
 * Hand-written, because Scramble types the codes as plain strings. The api
 * source is `App\\Support\\AvatarTemplates\\TavusPalSync`;
 * `tests/unit/avatar-template-catalogue-api-shape.spec.ts` pins this list to it.
 */
export const PAL_SYNC_CODES = [
  'tavus_key_missing',
  'pal_id_missing',
  'pal_not_editable',
  'pal_sync_rejected',
  'pal_sync_unauthorized',
  'pal_not_found',
  'pal_sync_failed',
  'pal_sync_unreachable',
] as const

export type PalSyncCode = (typeof PAL_SYNC_CODES)[number]

/**
 * Narrowed like `config`/`provider` above: Scramble types the three members as
 * plain `string | null`; the closed sets live in a PHP enum. `synced_at` is the
 * last SUCCESSFUL sync and survives a later failure.
 */
export type PalSync = Omit<GeneratedTemplate['pal_sync'], 'status' | 'code'> & {
  status: 'synced' | 'skipped' | 'warning' | null
  code: PalSyncCode | null
}

export type AvatarTemplate = Omit<
  GeneratedTemplate,
  'config' | 'provider' | 'description' | 'pal_sync'
> & {
  config: Record<string, unknown>
  provider: ProviderName
  description: string | null
  pal_sync: PalSync
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
export type TemplateResponse = Omit<
  paths['/avatar-templates']['post']['responses']['201']['content']['application/json'],
  'data'
> & { data: AvatarTemplate; warning?: string }

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

/** Who owns a template: the caller's organization, or the platform (a global). */
export type TemplateScope = components['schemas']['AvatarTemplateScope']

export type TemplateOptionsResponse =
  paths['/avatar-templates/options']['get']['responses']['200']['content']['application/json']

/**
 * Copy-to-organizations, derived from the generated client (no hand-written
 * API shapes): the request body and the 201 envelope of
 * `POST /avatar-templates/{id}/duplicate`.
 */
export type DuplicateTemplateResponse =
  paths['/avatar-templates/{id}/duplicate']['post']['responses']['201']['content']['application/json']

export type DuplicatedTemplate = DuplicateTemplateResponse['data'][number]

type GeneratedPlatformTemplate = components['schemas']['PlatformAvatarTemplateResource']

/**
 * A platform (global) template as the superadmin's management page reads it:
 * the same narrowings as `AvatarTemplate`, plus how far its reach extends.
 * `usage` counts non-deleted pinning projects across EVERY organization and is
 * the only cross-tenant number the api exposes (never organization names).
 */
export type PlatformTemplate = Omit<
  GeneratedPlatformTemplate,
  'config' | 'provider' | 'description' | 'pal_sync'
> & {
  config: Record<string, unknown>
  provider: ProviderName
  description: string | null
  pal_sync: PalSync
}

export type PlatformTemplateUsage = GeneratedPlatformTemplate['usage']

/** Same conditional `warning` code as `TemplateResponse`, for the platform routes. */
export type PlatformTemplateResponse = Omit<
  paths['/admin/avatar-templates']['post']['responses']['201']['content']['application/json'],
  'data'
> & { data: PlatformTemplate; warning?: string }

/** Derived from the generated list response; only `data` is re-narrowed. */
export type PlatformTemplateListResponse = Omit<
  paths['/admin/avatar-templates']['get']['responses']['200']['content']['application/json'],
  'data'
> & { data: PlatformTemplate[] }

type PlatformStoreBody =
  paths['/admin/avatar-templates']['post']['requestBody']['content']['application/json']
type PlatformUpdateBody = NonNullable<
  paths['/admin/avatar-templates/{id}']['patch']['requestBody']
>['content']['application/json']

/**
 * The platform write bodies, with `config` re-narrowed to the string-keyed MAP
 * the api really validates (the generated `string[]` is Scramble reading a PHP
 * `array` rule as a list) — the same narrowing `AvatarTemplate['config']` has,
 * pinned by `tests/nuxt/avatar-template-config-contract.ts`.
 */
export type PlatformTemplateCreatePayload = Omit<PlatformStoreBody, 'config'> & {
  config: Record<string, unknown>
}
export type PlatformTemplateUpdatePayload = Omit<PlatformUpdateBody, 'config'> & {
  config?: Record<string, unknown>
}

/**
 * The persona a WRITE may carry, derived from the generated store body so a
 * rename or narrowing in the api breaks this file's compile.
 */
export type PersonaWrite = NonNullable<
  paths['/avatar-templates']['post']['requestBody']['content']['application/json']['persona']
>

type StoreBody = paths['/avatar-templates']['post']['requestBody']['content']['application/json']
type UpdateBody = NonNullable<
  paths['/avatar-templates/{id}']['patch']['requestBody']
>['content']['application/json']

/**
 * The organization write bodies, derived from the generated client so a field
 * the api gains or loses breaks this file's compile. `config` is re-narrowed to
 * the string-keyed MAP the api really validates (the generated `string[]` is
 * Scramble reading a PHP `array` rule as a list), like the platform bodies
 * above. `provider` is absent from the update: the api refuses to change it.
 */
export type TemplateCreatePayload = Omit<StoreBody, 'config'> & {
  config: Record<string, unknown>
}
export type TemplateUpdatePayload = Omit<UpdateBody, 'config'> & {
  config?: Record<string, unknown>
}

/**
 * The import answer, derived from the generated client. `data` is `unknown[]`
 * (the controller maps records without a resource) and the page reads only its
 * length; `tests/nuxt/avatar-template-import-response-contract.ts` pins it.
 */
export type ImportTemplatesResponse =
  paths['/avatar-templates/import']['post']['responses']['201']['content']['application/json']

/**
 * What the template form emits on submit.
 *
 * `persona` is narrowed from the read shape (`{display_name: string | null}`)
 * because a WRITE says less: `{}` clears the interviewer name, and an absent key
 * leaves it untouched. See `useAvatarTemplates.updateTemplate`.
 */
export type AvatarTemplateSubmit = Omit<Partial<AvatarTemplate>, 'persona'> & {
  persona?: PersonaWrite
}
