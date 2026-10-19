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
  Omit<Stored, 'data'> & { data: AvatarTemplate; warning?: string }
> = true
export const platformResponseIsDerived: Equal<
  PlatformTemplateResponse,
  Omit<PlatformStored, 'data'> & { data: PlatformTemplate; warning?: string }
> = true
