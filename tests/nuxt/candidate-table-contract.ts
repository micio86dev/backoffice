/**
 * COMPILE-TIME contract test — enforced by `bun run typecheck`, not by Vitest.
 *
 * Why it lives in `tests/nuxt/` and not next to the other unit specs:
 * `.nuxt/tsconfig.app.json` (the project `nuxi typecheck` actually builds)
 * includes `../app/**`, `../tests/nuxt/**` and `../test/nuxt/**` — it does NOT
 * include `tests/unit/**`. Verified empirically: a deliberate `const x: number
 * = 'str'` placed in `tests/unit/` passes `bun run typecheck`, the identical
 * line in `tests/nuxt/` fails it. A type-level assertion written under
 * `tests/unit/` would therefore be a gate that can never fail — exactly the
 * class of non-evidence AGENTS.md forbids.
 *
 * What it guards: `CandidateTable.vue`'s public prop contract must BE the
 * generated OpenAPI schema, not a hand-maintained copy of it. Mutual
 * assignability is asserted in both directions, so a re-introduced local
 * duplicate breaks the build the moment the server-side resource changes a
 * field — instead of silently rendering `undefined`.
 */
import type {
  CandidateTableMeta,
  CandidateTableParticipant,
} from '../../app/components/organisms/CandidateTable.vue'
import type { components, paths } from '../../types/api'

type ParticipantListPayload =
  paths['/participants']['get']['responses']['200']['content']['application/json']

/** Resolves to `true` only when A and B are mutually assignable. */
type MutuallyAssignable<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false

export const participantRowMatchesGeneratedSchema: MutuallyAssignable<
  CandidateTableParticipant,
  components['schemas']['ParticipantResource']
> = true

export const participantRowMatchesListPayload: MutuallyAssignable<
  CandidateTableParticipant,
  ParticipantListPayload['data'][number]
> = true

export const paginationMetaMatchesListPayload: MutuallyAssignable<
  CandidateTableMeta,
  ParticipantListPayload['meta']
> = true
