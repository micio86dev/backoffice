/**
 * COMPILE-TIME contract test — enforced by `bun run typecheck`, not by Vitest
 * (see `candidate-table-contract.ts` for why `tests/unit/**` cannot host a
 * type-level gate: `.nuxt/tsconfig.app.json` does not include it).
 *
 * What it guards (reusable-interview-links, design AD-17):
 *
 * - The create call's request and response types DERIVE from the generated
 *   client's `paths[...]`, never a hand-written copy: the payload's only key is
 *   an optional, nullable `label`, and the response carries `entry_url`.
 * - `ReusableEntryLink` has NO `expires_at`. A reusable link never expires, so
 *   the type must make an expiry unrepresentable: the panel's reusable variant
 *   cannot be handed one by mistake, and a single-use link cannot be handed to
 *   it either, because `EntryLink` still requires the field.
 *
 * Not covered here, on purpose: the admin participant `reusable_link` marker
 * and the list/disable operations. They ship with the api read marker and the
 * links panel (the next slice), together with their own contract assertions.
 */
import type {
  EntryLink,
  ReusableEntryLink,
} from '../../app/components/organisms/EntryLinkPanel.vue'
import type {
  CreateReusableLinkPayload,
  CreateReusableLinkResponse,
} from '../../app/composables/useReusableLinks'
import type { paths } from '../../types/api'

/** Resolves to `true` only when A and B are mutually assignable. */
type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

/** Resolves to `true` only when `K` is NOT a key of `T`. */
type LacksKey<T, K extends string> = K extends keyof T ? false : true

/** Resolves to `true` only when every picked key is optional. */
type KeysAreOptional<T, K extends keyof T> = object extends Pick<T, K> ? true : false

type CreateOperation = paths['/projects/{project}/reusable-links']['post']

// -- Create payload: one optional, nullable key, derived from `paths` --------

export const payloadIsDerivedFromPaths: MutuallyAssignable<
  CreateReusableLinkPayload,
  NonNullable<CreateOperation['requestBody']>['content']['application/json']
> = true

export const payloadLabelIsNullableString: MutuallyAssignable<
  CreateReusableLinkPayload['label'],
  string | null | undefined
> = true

export const payloadLabelIsOptional: KeysAreOptional<CreateReusableLinkPayload, 'label'> = true

/** An empty object is a valid payload: an empty Link name sends `{}`. */
export const emptyPayloadIsValid: CreateReusableLinkPayload = {}

export const payloadCarriesNothingElse: LacksKey<CreateReusableLinkPayload, 'project_id'> = true

// -- Create response: the show-once URL plus the link's metadata -------------

export const responseIsDerivedFromPaths: MutuallyAssignable<
  CreateReusableLinkResponse,
  CreateOperation['responses']['201']['content']['application/json']
> = true

export const responseCarriesEntryUrl: MutuallyAssignable<
  CreateReusableLinkResponse['entry_url'],
  string
> = true

/** The response never carries a bare `token` field: the URL is the only carrier. */
export const responseHasNoBareToken: LacksKey<CreateReusableLinkResponse, 'token'> = true

export const responseDataHasNoHash: LacksKey<CreateReusableLinkResponse['data'], 'token_hash'> =
  true

// -- ReusableEntryLink: a URL and no expiry ----------------------------------

export const reusableLinkAcceptsAnEntryUrl: ReusableEntryLink = {
  entry_url: 'https://interview.example.test/interview/reusable#beai_rl_x',
}

/**
 * The key exists only as `expires_at?: never`, so the only value it can hold is
 * `undefined`: an expiry is unrepresentable, not merely optional.
 */
export const reusableLinkExpiryCanOnlyBeAbsent: MutuallyAssignable<
  ReusableEntryLink['expires_at'],
  undefined
> = true

export const reusableLinkRejectsAnExpiry: ReusableEntryLink = {
  entry_url: 'https://interview.example.test/interview/reusable#beai_rl_x',
  // @ts-expect-error a reusable link never expires: `expires_at` must not exist.
  expires_at: '2026-10-01T10:00:00.000000Z',
}

// -- EntryLink: the single-use shape is unchanged ----------------------------

export const singleUseLinkStillRequiresAnExpiry: MutuallyAssignable<
  EntryLink['expires_at'],
  string
> = true

// @ts-expect-error a single-use link without an expiry is not an EntryLink.
export const singleUseLinkRejectsMissingExpiry: EntryLink = {
  entry_url: 'https://interview.example.test/interview/tok',
}

/**
 * The create result is assignable to the reusable panel's input once the
 * wrapper keeps only `entry_url` (what `ProjectTable` does): no cast needed.
 */
export const createResultFeedsThePanel = (
  result: CreateReusableLinkResponse
): ReusableEntryLink => ({
  entry_url: result.entry_url,
})
