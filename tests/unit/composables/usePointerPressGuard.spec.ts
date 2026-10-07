/**
 * `usePointerPressGuard` defers a field's blur validation while a pointer press is in
 * progress, so an error inserted above a control cannot move it between pointerdown and
 * pointerup and swallow the click (the template form lost the click on the voice picker).
 *
 * The form-level behaviour is covered by the AvatarTemplateForm spec; this file pins the
 * contract of the composable itself, including the two edges a real operator reaches:
 * a pointerup with no matching pointerdown, and a second press that starts before the
 * deferred validation has run (a double click).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'
import { usePointerPressGuard } from '../../../app/composables/usePointerPressGuard'

type Guard = ReturnType<typeof usePointerPressGuard>

let wrapper: VueWrapper | null = null

function mountGuard(): Guard {
  let guard!: Guard

  wrapper = mount(
    defineComponent({
      setup() {
        guard = usePointerPressGuard()
        return () => h('div')
      },
    }),
    { attachTo: document.body }
  )

  return guard
}

function press(type: 'pointerdown' | 'pointerup' | 'pointercancel'): void {
  document.dispatchEvent(new Event(type, { bubbles: true }))
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.useRealTimers()
})

describe('usePointerPressGuard', () => {
  it('validates at once when no pointer is pressed (keyboard Tab keeps its immediate feedback)', () => {
    const { guardBlur } = mountGuard()
    const validate = vi.fn()

    guardBlur(validate)

    expect(validate).toHaveBeenCalledTimes(1)
  })

  it('queues the validation while a pointer is down and runs it one macrotask after pointerup', () => {
    const { guardBlur } = mountGuard()
    const validate = vi.fn()

    press('pointerdown')
    guardBlur(validate)
    expect(validate).not.toHaveBeenCalled()

    press('pointerup')
    expect(validate).not.toHaveBeenCalled()

    vi.runAllTimers()
    expect(validate).toHaveBeenCalledTimes(1)
  })

  it('also releases the queue when the press is cancelled', () => {
    const { guardBlur } = mountGuard()
    const validate = vi.fn()

    press('pointerdown')
    guardBlur(validate)
    press('pointercancel')
    vi.runAllTimers()

    expect(validate).toHaveBeenCalledTimes(1)
  })

  it('runs each queued validation exactly once, even if the same blur is queued twice', () => {
    const { guardBlur } = mountGuard()
    const validate = vi.fn()

    press('pointerdown')
    guardBlur(validate)
    guardBlur(validate)
    press('pointerup')
    vi.runAllTimers()

    expect(validate).toHaveBeenCalledTimes(1)
  })

  it('ignores a pointerup that has no matching pointerdown and keeps the queue untouched', () => {
    const { guardBlur } = mountGuard()
    const validate = vi.fn()

    press('pointerdown')
    guardBlur(validate)
    press('pointerup')
    // A stray pointerup while nothing is pressed must not schedule another flush.
    press('pointerup')
    vi.runAllTimers()

    expect(validate).toHaveBeenCalledTimes(1)
  })

  it('holds the queue when a second press starts before the deferred flush runs (double click)', () => {
    const { guardBlur } = mountGuard()
    const validate = vi.fn()

    press('pointerdown')
    guardBlur(validate)
    press('pointerup')
    // The flush is scheduled but has not run: the operator presses again.
    press('pointerdown')
    vi.runAllTimers()
    expect(validate).not.toHaveBeenCalled()

    press('pointerup')
    vi.runAllTimers()
    expect(validate).toHaveBeenCalledTimes(1)
  })

  it('drops the queue and stops listening when the component unmounts', () => {
    const { guardBlur } = mountGuard()
    const validate = vi.fn()

    press('pointerdown')
    guardBlur(validate)
    wrapper?.unmount()
    wrapper = null

    press('pointerup')
    vi.runAllTimers()

    expect(validate).not.toHaveBeenCalled()
  })
})
