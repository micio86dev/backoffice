/**
 * entry-link-participant-gate.spec.ts
 *
 * Pure client-side mirror of the PARTICIPANT-STATUS half of the API's mint
 * decision (api/app/Support/Sso/EntryLinkMinter.php:57-70): a `completato`
 * participant refuses with reason 'completed', an `errore` participant with
 * 'failed', anything else mints normally as far as this gate is concerned.
 */
import { describe, it, expect } from 'vitest'
import { entryLinkParticipantReason } from '../../../app/utils/entry-link-participant-gate'

describe('entryLinkParticipantReason', () => {
  it("returns 'completed' for a completato participant", () => {
    expect(entryLinkParticipantReason('completato')).toBe('completed')
  })

  it("returns 'failed' for an errore participant", () => {
    expect(entryLinkParticipantReason('errore')).toBe('failed')
  })

  it.each(['in_attesa', 'in_corso', 'in_valutazione'])(
    'returns null for %s — this gate has no opinion on non-terminal statuses',
    (status) => {
      expect(entryLinkParticipantReason(status)).toBeNull()
    }
  )

  it('returns null for an unrecognized status — fail-open on THIS gate alone', () => {
    // Fail-open here is safe: an unrecognized status is not one of the two
    // terminal states the server refuses on, and the server remains the sole
    // authority regardless of what this predicate says.
    expect(entryLinkParticipantReason('some_future_status')).toBeNull()
  })
})
