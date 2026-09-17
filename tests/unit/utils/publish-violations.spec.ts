/**
 * publish-violations.ts (framework-catalogue-authoring PR10b, task 39b.5)
 */
import { describe, it, expect } from 'vitest'
import { extractPublishViolations } from '../../../app/utils/publish-violations'

describe('extractPublishViolations', () => {
  it('reads the full violations list from a 422 rejection', () => {
    const error = {
      status: 422,
      data: {
        violations: [
          { rule: 'roles_closed_set', subject: 'revision:1', detail: 'too many roles' },
          {
            rule: 'exactly_three_indicators',
            subject: 'role:1 competency:2',
            detail: 'found 4',
          },
        ],
      },
    }

    expect(extractPublishViolations(error)).toEqual([
      { rule: 'roles_closed_set', subject: 'revision:1', detail: 'too many roles' },
      { rule: 'exactly_three_indicators', subject: 'role:1 competency:2', detail: 'found 4' },
    ])
  })

  it('drops entries that do not match the {rule, subject, detail} shape', () => {
    const error = {
      status: 422,
      data: {
        violations: [
          { rule: 'roles_closed_set', subject: 'revision:1', detail: 'ok' },
          'a bare string entry',
          { rule: 'missing_subject' },
          null,
        ],
      },
    }

    expect(extractPublishViolations(error)).toEqual([
      { rule: 'roles_closed_set', subject: 'revision:1', detail: 'ok' },
    ])
  })

  it('returns an empty list for a rejection with no violations body', () => {
    expect(extractPublishViolations(Object.assign(new Error('403'), { status: 403 }))).toEqual([])
    expect(extractPublishViolations(new Error('network failure'))).toEqual([])
    expect(extractPublishViolations(null)).toEqual([])
    expect(extractPublishViolations(undefined)).toEqual([])
  })

  it('returns an empty list when violations is present but not an array', () => {
    expect(extractPublishViolations({ data: { violations: 'not an array' } })).toEqual([])
  })
})
