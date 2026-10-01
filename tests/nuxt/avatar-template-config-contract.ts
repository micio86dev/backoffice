/**
 * COMPILE-TIME contract — enforced by `bun run typecheck`, not by Vitest
 * (`tests/unit/**` is never compiled by nuxi; see abilities-contract.ts).
 *
 * Avatar-template `config` is a string-keyed MAP on read and write. The
 * generated write bodies say `string[]` (Scramble infers a list from the PHP
 * `array` rule); if the narrowing regresses, this file stops compiling.
 */
import type { AvatarTemplate, PlatformTemplate } from '../../app/types/avatar-template'
import type { useAvatarTemplates } from '../../app/composables/useAvatarTemplates'
import type { usePlatformAvatarTemplates } from '../../app/composables/usePlatformAvatarTemplates'

type Api = ReturnType<typeof useAvatarTemplates>
type PlatformApi = ReturnType<typeof usePlatformAvatarTemplates>
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false
type Config = Record<string, unknown>

export const readIsMap: Equal<AvatarTemplate['config'], Config> = true
export const createIsMap: Equal<Parameters<Api['createTemplate']>[0]['config'], Config> = true
export const updateIsMap: Equal<
  NonNullable<Parameters<Api['updateTemplate']>[1]['config']>,
  Config
> = true

// The platform write bodies carry the same generated `string[]`.
export const platformReadIsMap: Equal<PlatformTemplate['config'], Config> = true
export const platformCreateIsMap: Equal<Parameters<PlatformApi['create']>[0]['config'], Config> =
  true
export const platformUpdateIsMap: Equal<
  NonNullable<Parameters<PlatformApi['update']>[1]['config']>,
  Config
> = true
