/**
 * COMPILE-TIME contract test — enforced by `bun run typecheck`, not by Vitest
 * (see `candidate-table-contract.ts` for why `tests/unit/**` cannot host a
 * type-level gate: `.nuxt/tsconfig.app.json` does not include it).
 *
 * What it guards (reusable-interview-links, admin-read-api "Participant List And
 * Detail Carry The Reusable Link Origin", design AD-17): the marker that says a
 * participant started from a reusable link.
 *
 * - The admin participants list row and the admin detail resource carry
 *   `reusable_link`, typed from the regenerated client and never a hand-written
 *   copy: an object with a string `id` and a NULLABLE string `label`, or `null`.
 * - The key is REQUIRED. A required key is what makes every fixture typed
 *   against those resources state the origin deliberately (`null` for an
 *   ordinary participant) instead of silently omitting it.
 * - The object carries exactly `id` and `label`: no token prefix, hash, counter
 *   or URL can reach the page through this type.
 * - The candidate session schema (`App.Http.Resources.ParticipantResource`) and
 *   the M2M enrolment schema carry NO such key. An origin is operator data; the
 *   api pins that with arch tests, and this is the same guarantee one layer
 *   down, so a regeneration that ever exposed it on those shapes fails the
 *   backoffice build too.
 *
 * "Absent" is asserted with `LacksKey`, not by reading the field: a field typed
 * `never` (or `?: never`) still EXPOSES the key, and a value read through it can
 * only ever be `undefined`. The key must not exist at all.
 */
import type {
  ParticipantDetailResponse,
  ParticipantListResponse,
} from '../../app/composables/useParticipants'
import type { components } from '../../types/api'

/** Resolves to `true` only when A and B are mutually assignable. */
type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

/** Resolves to `true` only when `K` is NOT a key of `T`. */
type LacksKey<T, K extends string> = K extends keyof T ? false : true

/** Resolves to `true` only when the picked key is REQUIRED (not optional). */
type KeyIsRequired<T, K extends keyof T> = object extends Pick<T, K> ? false : true

/** The wire shape the spec fixes: `{id, label}` with a nullable label, or `null`. */
type ExpectedMarker = { id: string; label: string | null } | null

type ListRow = ParticipantListResponse['data'][number]
type DetailRow = ParticipantDetailResponse['data']

// -- Admin list row and detail: the same marker, derived from the client -----

export const listRowMarkerIsTheSpecShape: MutuallyAssignable<
  ListRow['reusable_link'],
  ExpectedMarker
> = true

export const detailMarkerIsTheSpecShape: MutuallyAssignable<
  DetailRow['reusable_link'],
  ExpectedMarker
> = true

export const markerLabelIsNullable: MutuallyAssignable<
  NonNullable<DetailRow['reusable_link']>['label'],
  string | null
> = true

export const markerIdIsAString: MutuallyAssignable<
  NonNullable<DetailRow['reusable_link']>['id'],
  string
> = true

// -- Required key: a typed fixture cannot leave it out -----------------------

export const listRowMarkerKeyIsRequired: KeyIsRequired<ListRow, 'reusable_link'> = true

export const detailMarkerKeyIsRequired: KeyIsRequired<DetailRow, 'reusable_link'> = true

export const generatedListSchemaMarkerKeyIsRequired: KeyIsRequired<
  components['schemas']['ParticipantResource'],
  'reusable_link'
> = true

export const generatedDetailSchemaMarkerKeyIsRequired: KeyIsRequired<
  components['schemas']['ParticipantDetailResource'],
  'reusable_link'
> = true

// -- The marker object carries nothing else ----------------------------------

type Marker = NonNullable<DetailRow['reusable_link']>

export const markerHasOnlyIdAndLabel: MutuallyAssignable<keyof Marker, 'id' | 'label'> = true

export const markerHasNoTokenPrefix: LacksKey<Marker, 'token_prefix'> = true
export const markerHasNoTokenHash: LacksKey<Marker, 'token_hash'> = true
export const markerHasNoUrl: LacksKey<Marker, 'entry_url'> = true

// -- Values: an origin, a label-less origin, and an ordinary participant -----

export const markerAcceptsALabelledOrigin: DetailRow['reusable_link'] = {
  id: 'rlk_01HZ0000000000000000000000',
  label: 'Milan fair stand',
}

export const markerAcceptsALabelLessOrigin: DetailRow['reusable_link'] = {
  id: 'rlk_01HZ0000000000000000000000',
  label: null,
}

export const markerAcceptsAnOrdinaryParticipant: DetailRow['reusable_link'] = null

// @ts-expect-error the key is always present on the wire: `undefined` is not a marker.
export const markerRejectsUndefined: DetailRow['reusable_link'] = undefined

// @ts-expect-error `label` is part of the shape: it is `null` when unnamed, never missing.
export const markerRejectsAMissingLabel: DetailRow['reusable_link'] = {
  id: 'rlk_01HZ0000000000000000000000',
}

export const markerRejectsExtraKeys: DetailRow['reusable_link'] = {
  id: 'rlk_01HZ0000000000000000000000',
  label: null,
  // @ts-expect-error only `id` and `label` are exposed: a token prefix must not type-check.
  token_prefix: 'beai_rl_AbCdEfGh',
}

// -- Candidate and M2M shapes: no such key -----------------------------------

type CandidateParticipant = components['schemas']['App.Http.Resources.ParticipantResource']
type EnrolmentParticipant = components['schemas']['ParticipantEnrolmentResource']

export const candidateSchemaHasNoReusableLink: LacksKey<CandidateParticipant, 'reusable_link'> =
  true

export const enrolmentSchemaHasNoReusableLink: LacksKey<EnrolmentParticipant, 'reusable_link'> =
  true
