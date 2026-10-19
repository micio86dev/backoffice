/**
 * COMPILE-TIME contract — enforced by `bun run typecheck`, not by Vitest.
 *
 * The single-template envelopes are the generated store/update bodies with
 * `data` re-narrowed to the template shape and the conditional `warning` code
 * added (Scramble sees the resource, not the `additional()` an unhappy path
 * attaches). A change to the generated envelope breaks the derivation.
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

export const templateResponseIsDerived: Equal<
  TemplateResponse,
  Omit<Stored, 'data'> & { data: AvatarTemplate; warning?: PalSyncCode }
> = true
export const platformResponseIsDerived: Equal<
  PlatformTemplateResponse,
  Omit<PlatformStored, 'data'> & { data: PlatformTemplate; warning?: PalSyncCode }
> = true

// The `warning` is a persona-sync code (`TavusPalSync` puts its code in `message`,
// `ValidatesAvatarTemplateWrites` forwards it). The generated envelope does not
// carry it (conditional, attached by `additional()`), so it is compared with the
// generated `pal_sync.code` enum of the SAME response, read straight from `paths`
// and not through the types file's own aliases: a code the api adds or drops, or a
// hand-written union that drifts, stops this compiling.
export const warningIsTheGeneratedPalSyncCode: Equal<
  NonNullable<TemplateResponse['warning']>,
  NonNullable<Stored['data']['pal_sync']['code']>
> = true
export const platformWarningIsTheGeneratedPalSyncCode: Equal<
  NonNullable<PlatformTemplateResponse['warning']>,
  NonNullable<PlatformStored['data']['pal_sync']['code']>
> = true

// Sentinel for the day the api documents `warning` itself: the hand-added member
// above is then redundant and must be derived from the generated one instead.
export const generatedEnvelopesDoNotCarryWarningYet: Equal<
  'warning' extends keyof Stored ? true : false,
  false
> = true
