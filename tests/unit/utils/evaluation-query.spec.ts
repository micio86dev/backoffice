/**
 * buildEvaluationQuery — whitelisted evaluation filters to a query string.
 */
import { describe, it, expect } from 'vitest'
import { buildEvaluationQuery } from '../../../app/utils/evaluation-query'

describe('buildEvaluationQuery', () => {
  it('returns an empty string when no filter is set (no dangling "?")', () => {
    expect(buildEvaluationQuery({})).toBe('')
  })

  it('serialises every supported filter', () => {
    const query = buildEvaluationQuery({
      project_id: 4,
      assessment_type: 'potential',
      role_code: 'FLL',
      status: 'pending',
      evaluated_from: '2026-01-01',
      evaluated_to: '2026-01-31',
    })

    expect(new URLSearchParams(query.slice(1)).toString()).toBe(
      'project_id=4&assessment_type=potential&role_code=FLL&status=pending&evaluated_from=2026-01-01&evaluated_to=2026-01-31'
    )
    expect(query.startsWith('?')).toBe(true)
  })

  it('keeps project_id 0 (a defined id) but drops empty-string filters', () => {
    const query = buildEvaluationQuery({
      project_id: 0,
      role_code: '',
      evaluated_from: '',
      evaluated_to: '',
    })

    expect(query).toBe('?project_id=0')
  })
})
