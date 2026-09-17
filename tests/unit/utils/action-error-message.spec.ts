/**
 * action-error-message.ts — the D4-aware fallback shared by every container
 * that reports a failed reorder/remove without a field-shaped 422 body.
 */
import { describe, it, expect } from 'vitest'
import { actionErrorMessage } from '../../../app/utils/action-error-message'

const t = (key: string) => key

function httpError(status: number): Error & { status: number } {
  return Object.assign(new Error(`HTTP ${status}`), { status })
}

describe('actionErrorMessage', () => {
  it('keeps the caller’s own fallback copy for an unrecognised status', () => {
    expect(actionErrorMessage(httpError(500), t, 'projectQuestions.removeError')).toEqual({
      kind: 'error',
      text: 'projectQuestions.removeError',
    })
  })

  it('keeps the fallback for a non-HTTP rejection too', () => {
    expect(
      actionErrorMessage(new Error('network down'), t, 'projectQuestions.reorderError')
    ).toEqual({ kind: 'error', text: 'projectQuestions.reorderError' })
  })

  it('renders a 403 as forbidden, never the caller’s fallback copy', () => {
    expect(actionErrorMessage(httpError(403), t, 'projectQuestions.removeError')).toEqual({
      kind: 'error',
      text: 'errors.states.forbidden.message',
    })
  })

  it('renders a 404 as not-found', () => {
    expect(actionErrorMessage(httpError(404), t, 'projectQuestions.removeError')).toEqual({
      kind: 'error',
      text: 'errors.states.notFound.message',
    })
  })

  it('renders a 409 as waiting, not error', () => {
    expect(actionErrorMessage(httpError(409), t, 'projectQuestions.reorderError')).toEqual({
      kind: 'waiting',
      text: 'errors.states.notReady.message',
    })
  })
})
