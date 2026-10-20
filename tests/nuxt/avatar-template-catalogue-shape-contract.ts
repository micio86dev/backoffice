/**
 * COMPILE-TIME contract — enforced by `bun run typecheck`, not by Vitest.
 *
 * `CatalogueEntry`, `FieldSpec` and the catalogue and field-specs envelopes
 * are DERIVED from the generated client; only the members Scramble types as
 * plain strings are re-narrowed to their closed sets. This file pins that the
 * derivation keeps every generated key and requiredness, and exports the key
 * list so the unit spec `avatar-template-catalogue-api-shape.spec.ts` can
 * compare the generated schema's source with the api's own
 * (`AvatarProviderCatalogue::entry()` + the Tavus `editable` flag).
 */
import type { paths } from '../../types/api'
import type {
  PAL_SYNC_CODES,
  CatalogueEntry,
  CatalogueErrorCode,
  CatalogueStatus,
  PalSync,
  PalSyncCode,
  ProviderName,
  CatalogueEnvelope,
  CatalogueResponse,
  FieldSpec,
  FieldSpecsResponse,
} from '../../app/types/avatar-template'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

export const CATALOGUE_ENTRY_KEYS = [
  'id',
  'provider',
  'label',
  'name',
  'language',
  'locale',
  'accent',
  'italian',
  'preview_image_url',
  'preview_audio_url',
  'preview_audio_via_api',
  'preview_video_url',
  'editable',
] as const

export const entryKeysAreExhaustive: Equal<
  keyof CatalogueEntry,
  (typeof CATALOGUE_ENTRY_KEYS)[number]
> = true

type GeneratedCatalogue =
  paths['/avatar-templates/catalogue']['get']['responses']['200']['content']['application/json']['data']
type GeneratedEntry = GeneratedCatalogue['items'][number]
type GeneratedFieldSpec =
  paths['/avatar-templates/field-specs']['get']['responses']['200']['content']['application/json']['data']['heygen'][number]

// The hand narrowing adds no key the generated body lacks, and drops none.
export const catalogueResponseKeys: Equal<keyof CatalogueResponse, keyof GeneratedCatalogue> = true
export const fieldSpecKeys: Equal<keyof FieldSpec, keyof GeneratedFieldSpec> = true

// The envelopes keep the generated `data` wrapper.
export const catalogueEnvelopeKeys: Equal<keyof CatalogueEnvelope, 'data'> = true
export const fieldSpecsResponseKeys: Equal<keyof FieldSpecsResponse, 'data'> = true

// A derived entry keeps the generated requiredness: `preview_audio_via_api` is
// always present, `editable` is the one optional member.
export const entryKeysMatchGenerated: Equal<keyof CatalogueEntry, keyof GeneratedEntry> = true
export const viaApiFlagIsRequired: Equal<CatalogueEntry['preview_audio_via_api'], boolean> = true
export const editableIsOptional: Equal<
  Pick<CatalogueEntry, 'editable'>,
  Pick<GeneratedEntry, 'editable'>
> = true
// The closed sets are generated enums. Each runtime list is checked here
// against the generated type (both directions) and exported, so the unit spec
// can compare the same list with the literals the api source emits.
export const ITALIAN_VALUES = ['native', 'multilingual'] as const
export const CATALOGUE_STATUSES = ['ok', 'empty', 'provider_error'] as const
export const CATALOGUE_ERROR_CODES = [
  'provider_key_missing',
  'provider_unauthorized',
  'provider_rate_limited',
  'provider_unavailable',
  'provider_unreachable',
  'provider_rejected',
  'provider_bad_response',
  'unsupported_catalogue',
] as const
export const PAL_SYNC_STATUSES = ['synced', 'skipped', 'warning'] as const

export const italianValuesExhaustive: Equal<
  (typeof ITALIAN_VALUES)[number],
  NonNullable<CatalogueEntry['italian']>
> = true
export const catalogueStatusesExhaustive: Equal<
  (typeof CATALOGUE_STATUSES)[number],
  CatalogueStatus
> = true
export const catalogueErrorCodesExhaustive: Equal<
  (typeof CATALOGUE_ERROR_CODES)[number],
  CatalogueErrorCode
> = true
export const palSyncStatusesExhaustive: Equal<
  (typeof PAL_SYNC_STATUSES)[number],
  NonNullable<PalSync['status']>
> = true
export const palSyncCodesExhaustive: Equal<(typeof PAL_SYNC_CODES)[number], PalSyncCode> = true

// Requiredness and value types, not only keys: apart from the one re-narrowed
// member, the derived types ARE the generated ones.
export const fieldSpecMatchesGenerated: Equal<
  Omit<FieldSpec, 'catalogue_resource'>,
  Omit<GeneratedFieldSpec, 'catalogue_resource'>
> = true
export const catalogueResponseMatchesGenerated: Equal<
  Omit<CatalogueResponse, 'items'>,
  Omit<GeneratedCatalogue, 'items'>
> = true

// The provider key set. `ProviderName` types `Record<ProviderName, FieldSpec[]>`
// and the platform templates; `hr_avatar` is the optional extra key, present
// only on an organization template. A key the api adds breaks these.
type GeneratedFieldSpecsData =
  paths['/avatar-templates/field-specs']['get']['responses']['200']['content']['application/json']['data']
type StoreProvider =
  paths['/avatar-templates']['post']['requestBody']['content']['application/json']['provider']
export const providerNameIsTheRequiredKeys: Equal<
  ProviderName,
  Exclude<keyof GeneratedFieldSpecsData, 'hr_avatar'>
> = true
export const templateProvidersAreTheStoreEnum: Equal<ProviderName | 'hr_avatar', StoreProvider> =
  true
