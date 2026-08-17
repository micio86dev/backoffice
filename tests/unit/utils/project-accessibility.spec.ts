/**
 * project-accessibility.spec.ts (operator-interview-link, design D5)
 *
 * Pure client-side mirror of the API's `projectIsAccessible()` gate
 * (api/app/Support/Sso/EntryLinkMinter.php): status === 'active' AND
 * (goes_live_at is null or <= now) AND (deadline_at is null or > now). Used
 * to disable the mint action with a STATED reason rather than offering an
 * action guaranteed to fail server-side (403) — never as its own
 * authorization; the API still enforces every gate independently.
 */
import { describe, it, expect } from 'vitest'
import { projectAccessibility } from '../../../app/utils/project-accessibility'

function project(overrides: Partial<Parameters<typeof projectAccessibility>[0]> = {}) {
  return {
    status: 'active',
    goes_live_at: null,
    deadline_at: null,
    ...overrides,
  }
}

describe('projectAccessibility', () => {
  it('is eligible for an active project with no goes_live_at/deadline_at', () => {
    expect(projectAccessibility(project())).toEqual({ eligible: true, reason: null })
  })

  it('is eligible for an active project past goes_live_at and before deadline_at', () => {
    const result = projectAccessibility(
      project({
        goes_live_at: new Date(Date.now() - 60_000).toISOString(),
        deadline_at: new Date(Date.now() + 60_000).toISOString(),
      })
    )
    expect(result).toEqual({ eligible: true, reason: null })
  })

  it('is NOT eligible when status is draft — reason notActive', () => {
    expect(projectAccessibility(project({ status: 'draft' }))).toEqual({
      eligible: false,
      reason: 'notActive',
    })
  })

  it('is NOT eligible when status is archived — reason notActive', () => {
    expect(projectAccessibility(project({ status: 'archived' }))).toEqual({
      eligible: false,
      reason: 'notActive',
    })
  })

  it('is NOT eligible when goes_live_at is in the future — reason notYetLive', () => {
    const result = projectAccessibility(
      project({ goes_live_at: new Date(Date.now() + 60_000).toISOString() })
    )
    expect(result).toEqual({ eligible: false, reason: 'notYetLive' })
  })

  it('is NOT eligible when deadline_at is in the past — reason expired', () => {
    const result = projectAccessibility(
      project({ deadline_at: new Date(Date.now() - 60_000).toISOString() })
    )
    expect(result).toEqual({ eligible: false, reason: 'expired' })
  })

  it('status gate takes precedence over the temporal gates when both fail', () => {
    const result = projectAccessibility(
      project({
        status: 'draft',
        deadline_at: new Date(Date.now() - 60_000).toISOString(),
      })
    )
    expect(result).toEqual({ eligible: false, reason: 'notActive' })
  })
})
