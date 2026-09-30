/**
 * COMPILE-TIME contract test — enforced by `bun run typecheck`, not by Vitest
 * (see `candidate-table-contract.ts` for why `tests/unit/**` cannot host a
 * type-level gate: `.nuxt/tsconfig.app.json` does not include it).
 *
 * What it guards (candidate-external-reference, design AD-8): the candidate's
 * external reference (`external_id` + `source`) is OPERATOR data.
 *
 * - The invite payload may carry both, each optional and nullable.
 * - The admin participants list row and the admin detail resource carry both,
 *   typed from the regenerated client — never a hand-written copy.
 * - The CANDIDATE session schema (`App.Http.Resources.ParticipantResource`)
 *   carries NEITHER. The candidate must never be able to read the pair, and the
 *   api pins that with an arch test; this is the same guarantee one layer down,
 *   so a regeneration that ever exposed them on the candidate shape fails the
 *   backoffice build too.
 *
 * Fixtures and the UI use real numbers: `external_id` is `number | null`, never
 * a numeric string, and no cast is needed to satisfy the compiler.
 */
import type { GenerateEntryLinkPayload } from '../../app/composables/useEntryLinks'
import type { ParticipantDetailResponse } from '../../app/composables/useParticipants'
import type { components, paths } from '../../types/api'

type ParticipantListPayload =
  paths['/participants']['get']['responses']['200']['content']['application/json']

/** Resolves to `true` only when A and B are mutually assignable. */
type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

/** Resolves to `true` only when `K` is NOT a key of `T`. */
type LacksKey<T, K extends string> = K extends keyof T ? false : true

// -- Invite payload: both keys optional, nullable ---------------------------

export const entryLinkPayloadExternalIdIsNullableNumber: MutuallyAssignable<
  GenerateEntryLinkPayload['external_id'],
  number | null | undefined
> = true

export const entryLinkPayloadSourceIsNullableString: MutuallyAssignable<
  GenerateEntryLinkPayload['source'],
  string | null | undefined
> = true

/**
 * `MutuallyAssignable` above cannot prove optionality: indexed access on an
 * optional key yields the same `| undefined` union a required key would. An
 * empty object is assignable to the picked shape ONLY when every picked key is
 * optional, so this is the assertion that fails if either key becomes required.
 */
type KeysAreOptional<T, K extends keyof T> = object extends Pick<T, K> ? true : false

export const entryLinkPayloadKeysAreOptional: KeysAreOptional<
  GenerateEntryLinkPayload,
  'external_id' | 'source'
> = true

// -- Admin list row and detail: both keys, always present -------------------

export const listRowExternalIdIsNullableNumber: MutuallyAssignable<
  ParticipantListPayload['data'][number]['external_id'],
  number | null
> = true

export const listRowSourceIsNullableString: MutuallyAssignable<
  ParticipantListPayload['data'][number]['source'],
  string | null
> = true

export const detailExternalIdIsNullableNumber: MutuallyAssignable<
  ParticipantDetailResponse['data']['external_id'],
  number | null
> = true

export const detailSourceIsNullableString: MutuallyAssignable<
  ParticipantDetailResponse['data']['source'],
  string | null
> = true

// -- Candidate session shape: neither key -----------------------------------

type CandidateParticipant = components['schemas']['App.Http.Resources.ParticipantResource']

export const candidateSchemaHasNoExternalId: LacksKey<CandidateParticipant, 'external_id'> = true

export const candidateSchemaHasNoSource: LacksKey<CandidateParticipant, 'source'> = true
