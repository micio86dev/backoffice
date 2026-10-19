/**
 * COMPILE-TIME contract — enforced by `bun run typecheck`, not by Vitest
 * (`tests/unit/**` is never compiled by nuxi; see abilities-contract.ts).
 *
 * hr-avatar-adapter D-BO-TYPES: `ProviderName` keeps meaning "a provider a
 * platform template can have" (heygen | tavus). `hr_avatar` exists only on an
 * organization template (`TemplateProvider`) and only in the field-specs map
 * as an OPTIONAL key, so the existing `{ heygen: [], tavus: [] }` literals
 * keep compiling and platform code cannot see `hr_avatar` at all.
 */
import type { components } from '../../types/api'
import type {
  AvatarTemplate,
  OmitStrict,
  FieldSpec,
  FieldSpecMap,
  FieldSpecsResponse,
  PlatformTemplate,
  ProviderName,
  TemplateProvider,
} from '../../app/types/avatar-template'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

export const providerNameUnchanged: Equal<ProviderName, 'heygen' | 'tavus'> = true
export const templateProviderAddsHrAvatar: Equal<
  TemplateProvider,
  'heygen' | 'tavus' | 'hr_avatar'
> = true
export const organizationTemplateMayBeHrAvatar: Equal<
  AvatarTemplate['provider'],
  TemplateProvider
> = true
export const platformTemplateCannotBeHrAvatar: Equal<PlatformTemplate['provider'], ProviderName> =
  true
export const fieldSpecsResponseUsesTheMap: Equal<FieldSpecsResponse['data'], FieldSpecMap> = true

// The pre-existing literal still compiles: `hr_avatar` is optional.
export const legacyLiteral: FieldSpecMap = { heygen: [], tavus: [] }
export const capableLiteral: FieldSpecMap = { heygen: [], tavus: [], hr_avatar: [] }

// ...but heygen and tavus stay mandatory.
// @ts-expect-error a map without `tavus` is not a field-specs map
export const missingTavus: FieldSpecMap = { heygen: [] }

export const hrAvatarEntriesAreFieldLists: FieldSpec[] | undefined = capableLiteral.hr_avatar

// `hr_avatar_config_id` is the generated member, not a hand re-typing of it.
export const configIdIsGenerated: Equal<
  AvatarTemplate['hr_avatar_config_id'],
  components['schemas']['AvatarTemplateResource']['hr_avatar_config_id']
> = true

// A narrowing names a key the generated type really has: `OmitStrict` refuses an
// unknown key, where `Omit` would silently accept it and the narrowing would
// keep compiling after the api dropped the field.
export const strictOmitKeepsTheRest: Equal<keyof OmitStrict<{ a: 1; b: 2 }, 'a'>, 'b'> = true
// @ts-expect-error 'c' is not a key of the type
export type RefusedUnknownKey = OmitStrict<{ a: 1; b: 2 }, 'c'>
