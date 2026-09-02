/**
 * FormMessage — the ONE place an outcome becomes a colour.
 *
 * Eight call sites each carried their own copy of
 * `:variant="formMessage.kind === 'error' ? 'destructive' : 'default'"`, and
 * they did not agree: six mapped a SUCCESS to `default`, which renders grey,
 * so "your reset link has been sent" looked exactly like a neutral notice.
 * Two others mapped it to `success`. A third vocabulary existed as well —
 * `TemplatePortability` said `'ok'` where everyone else said `'success'`.
 *
 * The mapping lives here now, once. The variants themselves are NOT new:
 * `ui/alert` already defines `success`, `warning` and `destructive` on the
 * DESIGN.md semantic tokens, with the contrast reasoning recorded there. This
 * component's whole job is choosing between them consistently.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import FormMessage from '../../../../app/components/molecules/FormMessage.vue'

function mountMessage(props: Record<string, unknown>) {
  return mount(FormMessage, { props: { testId: 'x-banner', ...props } })
}

describe('FormMessage', () => {
  it('paints a success GREEN, not the neutral grey six call sites used', () => {
    const wrapper = mountMessage({ kind: 'success', text: 'Link sent.' })

    expect(wrapper.get('[data-testid="x-banner"]').classes().join(' ')).toContain('success')
    expect(wrapper.text()).toContain('Link sent.')
  })

  it('paints an error with the destructive variant', () => {
    const wrapper = mountMessage({ kind: 'error', text: 'Nope.' })

    expect(wrapper.get('[data-testid="x-banner"]').classes().join(' ')).toContain('destructive')
  })

  it('paints a warning yellow', () => {
    const wrapper = mountMessage({ kind: 'warning', text: 'Careful.' })

    expect(wrapper.get('[data-testid="x-banner"]').classes().join(' ')).toContain('warning')
  })

  it('leaves a waiting message neutral, which is what grey is FOR', () => {
    // Grey is not the absence of a colour here, it is the colour of "nothing
    // has happened yet". That is exactly why success must never borrow it.
    const wrapper = mountMessage({ kind: 'waiting', text: 'Working…' })

    const classes = wrapper.get('[data-testid="x-banner"]').classes().join(' ')

    expect(classes).not.toContain('success')
    expect(classes).not.toContain('destructive')
    expect(classes).not.toContain('warning')
  })

  it('announces itself to assistive tech, which every copy did by hand', () => {
    const banner = mountMessage({ kind: 'error', text: 'Nope.' }).get('[data-testid="x-banner"]')

    expect(banner.attributes('role')).toBe('alert')
    expect(banner.attributes('aria-live')).toBe('polite')
  })

  it('is focusable only when asked, for the pages that move focus to it', () => {
    expect(
      mountMessage({ kind: 'error', text: 'x' })
        .get('[data-testid="x-banner"]')
        .attributes('tabindex')
    ).toBeUndefined()

    expect(
      mountMessage({ kind: 'error', text: 'x', focusable: true })
        .get('[data-testid="x-banner"]')
        .attributes('tabindex')
    ).toBe('-1')
  })
})
