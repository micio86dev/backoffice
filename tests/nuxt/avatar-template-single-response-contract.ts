/**
 * COMPILE-TIME contract — enforced by `bun run typecheck`, not by Vitest.
 *
 * The single-template envelopes are the generated store/update bodies with
 * `data` re-narrowed to the template shape. `warning` is the generated optional
 * enum of the same envelope (persona-sync AND conversation-model codes), never a
 * hand-written union. A change to the generated envelope breaks the derivation.
 */
import type { paths } from '../../types/api'
import type {
  AvatarTemplate,
  PalSyncCode,
  PlatformTemplate,
  PlatformTemplateResponse,
  TemplateResponse,
} from '../../app/types/avatar-template'

type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

type Stored = paths['/avatar-templates']['post']['responses']['201']['content']['application/json']
type PlatformStored =
  paths['/admin/avatar-templates']['post']['responses']['201']['content']['application/json']
type Updated =
  paths['/avatar-templates/{id}']['patch']['responses']['200']['content']['application/json']
type Activated =
  paths['/avatar-templates/{id}/activate']['post']['responses']['200']['content']['application/json']
type PlatformUpdated =
  paths['/admin/avatar-templates/{id}']['patch']['responses']['200']['content']['application/json']

export const templateResponseIsDerived: Equal<
  TemplateResponse,
  Omit<Stored, 'data'> & { data: AvatarTemplate }
> = true
export const platformResponseIsDerived: Equal<
  PlatformTemplateResponse,
  Omit<PlatformStored, 'data'> & { data: PlatformTemplate }
> = true

// `warning` is the generated enum of the SAME envelope: the eight Tavus persona-sync
// codes plus the four HeyGen `llm_*` codes. A code the api adds or drops stops this
// compiling, and so does narrowing it back to `PalSyncCode` by hand.
export const warningIsTheGeneratedEnum: Equal<
  NonNullable<TemplateResponse['warning']>,
  NonNullable<Stored['warning']>
> = true
export const platformWarningIsTheGeneratedEnum: Equal<
  NonNullable<PlatformTemplateResponse['warning']>,
  NonNullable<PlatformStored['warning']>
> = true

// The write routes document one and the same set, so one derived type serves all.
export const updateWarningMatchesStore: Equal<
  NonNullable<Updated['warning']>,
  NonNullable<Stored['warning']>
> = true
export const activateWarningMatchesStore: Equal<
  NonNullable<Activated['warning']>,
  NonNullable<Stored['warning']>
> = true
export const platformUpdateWarningMatchesStore: Equal<
  NonNullable<PlatformUpdated['warning']>,
  NonNullable<PlatformStored['warning']>
> = true
export const platformWarningMatchesOrg: Equal<
  NonNullable<PlatformStored['warning']>,
  NonNullable<Stored['warning']>
> = true

// It is STRICTLY wider than the persona-sync set (the `llm_*` codes are extra), which
// is why `PalSyncCode` must not type it: a non-empty difference, not a subset check,
// so a collapse back to the Tavus set stops compiling.
export const warningIsWiderThanPalSync: Equal<
  [Exclude<NonNullable<TemplateResponse['warning']>, PalSyncCode>] extends [never] ? false : true,
  true
> = true
