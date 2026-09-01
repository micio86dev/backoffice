/**
 * EntryLinkForm.vue (operator-interview-link, design D4)
 *
 * `candidate_ref` + `display_name` only — `project_id` is known from context
 * (the row the operator opened the dialog from), never a third field to
 * pick. Form contract: `<form novalidate>`, `Field`/`FieldLabel`/`FieldError`,
 * per-field `aria-invalid`/`aria-describedby`, JS validation before submit
 * (required + `max:255`), `applyServerFieldErrors` with unmapped messages
 * surfacing in the form-level `role="alert"` banner.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const tMock = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key
const generateEntryLinkMock = vi.fn()

vi.mock('../../../../app/composables/useEntryLinks', () => ({
  useEntryLinks: () => ({ generateEntryLink: generateEntryLinkMock }),
}))

const EntryLinkForm = (await import('../../../../app/components/organisms/EntryLinkForm.vue'))
  .default

describe('EntryLinkForm', () => {
  beforeEach(() => {
    generateEntryLinkMock.mockReset().mockResolvedValue({
      entry_url: 'https://interview.example.com/interview/tok',
      expires_at: '2026-08-17T15:32:00.000000Z',
    })
  })

  function mountForm() {
    return mount(EntryLinkForm, {
      props: { projectId: 42 },
      global: { mocks: { $t: tMock } },
    })
  }

  it('sets novalidate on the form element', () => {
    const wrapper = mountForm()
    expect(wrapper.get('[data-testid="entry-link-form"]').attributes('novalidate')).toBeDefined()
  })

  it('rejects an empty candidate_ref on submit, with aria-invalid/aria-describedby wired', async () => {
    const wrapper = mountForm()

    await wrapper.get('[data-testid="entry-link-form"]').trigger('submit')
    await flushPromises()

    const input = wrapper.get('[data-testid="entry-link-form-candidate-ref"]')
    const error = wrapper.get('[data-testid="entry-link-form-candidate-ref-error"]')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect((input.attributes('aria-describedby') ?? '').split(/\s+/)).toContain(
      error.attributes('id')
    )
    expect(generateEntryLinkMock).not.toHaveBeenCalled()
  })

  it('rejects an empty display_name on submit, with aria-invalid/aria-describedby wired', async () => {
    const wrapper = mountForm()

    await wrapper.get('[data-testid="entry-link-form-candidate-ref"]').setValue('cand-1')
    await wrapper.get('[data-testid="entry-link-form"]').trigger('submit')
    await flushPromises()

    const input = wrapper.get('[data-testid="entry-link-form-display-name"]')
    const error = wrapper.get('[data-testid="entry-link-form-display-name-error"]')
    expect(input.attributes('aria-invalid')).toBe('true')
    expect((input.attributes('aria-describedby') ?? '').split(/\s+/)).toContain(
      error.attributes('id')
    )
  })

  it('rejects a candidate_ref longer than 255 characters', async () => {
    const wrapper = mountForm()

    await wrapper.get('[data-testid="entry-link-form-candidate-ref"]').setValue('x'.repeat(256))
    await wrapper.get('[data-testid="entry-link-form-email"]').setValue('mario@example.test')
    await wrapper.get('[data-testid="entry-link-form-display-name"]').setValue('Someone')
    await wrapper.get('[data-testid="entry-link-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="entry-link-form-candidate-ref-error"]').exists()).toBe(true)
    expect(generateEntryLinkMock).not.toHaveBeenCalled()
  })

  it('submits project_id + candidate_ref + email + display_name and emits success', async () => {
    const wrapper = mountForm()

    await wrapper.get('[data-testid="entry-link-form-candidate-ref"]').setValue('cand-1')
    await wrapper.get('[data-testid="entry-link-form-email"]').setValue('mario@example.test')
    await wrapper.get('[data-testid="entry-link-form-display-name"]').setValue('Mario Rossi')
    await wrapper.get('[data-testid="entry-link-form"]').trigger('submit')
    await flushPromises()

    expect(generateEntryLinkMock).toHaveBeenCalledWith({
      project_id: 42,
      candidate_ref: 'cand-1',
      display_name: 'Mario Rossi',
      email: 'mario@example.test',
      // Checked by default: the operator opened "invite a candidate", and
      // producing a link while quietly not sending it is the behaviour this
      // whole feature exists to end.
      send_email: true,
    })
    expect(wrapper.emitted('success')).toBeTruthy()
    expect(wrapper.emitted('success')?.[0]?.[0]).toEqual({
      entry_url: 'https://interview.example.com/interview/tok',
      expires_at: '2026-08-17T15:32:00.000000Z',
    })
  })

  it('surfaces a mapped 422 (candidate_ref) next to its own control', async () => {
    generateEntryLinkMock.mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { candidate_ref: ['That candidate reference is already in use.'] } },
      })
    )

    const wrapper = mountForm()
    await wrapper.get('[data-testid="entry-link-form-candidate-ref"]').setValue('cand-1')
    await wrapper.get('[data-testid="entry-link-form-email"]').setValue('mario@example.test')
    await wrapper.get('[data-testid="entry-link-form-display-name"]').setValue('Mario Rossi')
    await wrapper.get('[data-testid="entry-link-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.get('[data-testid="entry-link-form-candidate-ref-error"]').text()).toContain(
      'That candidate reference is already in use.'
    )
  })

  it('surfaces an unmapped 422 (e.g. role_code) in the form-level role="alert" banner', async () => {
    generateEntryLinkMock.mockRejectedValueOnce(
      Object.assign(new Error('422'), {
        status: 422,
        data: { errors: { role_code: ['role_code does not match the project role.'] } },
      })
    )

    const wrapper = mountForm()
    await wrapper.get('[data-testid="entry-link-form-candidate-ref"]').setValue('cand-1')
    await wrapper.get('[data-testid="entry-link-form-email"]').setValue('mario@example.test')
    await wrapper.get('[data-testid="entry-link-form-display-name"]').setValue('Mario Rossi')
    await wrapper.get('[data-testid="entry-link-form"]').trigger('submit')
    await flushPromises()

    const banner = wrapper.get('[data-testid="entry-link-form-banner"]')
    expect(banner.attributes('role')).toBe('alert')
    expect(banner.text()).toContain('role_code does not match the project role.')
  })
})

describe('EntryLinkForm — the email is required, because it is the identity', () => {
  beforeEach(() => {
    generateEntryLinkMock.mockReset().mockResolvedValue({
      entry_url: 'https://interview.example.com/interview/tok',
      expires_at: '2026-08-17T15:32:00.000000Z',
    })
  })

  function mountForm() {
    return mount(EntryLinkForm, {
      props: { projectId: 42 },
      global: { mocks: { $t: tMock } },
    })
  }

  it('refuses a submit with no email, on the control rather than in the banner', async () => {
    // Required at the server too. Checked here so the operator is told WHICH
    // field is missing instead of receiving the form-level "could not save"
    // an unmapped 422 produces.
    const wrapper = mountForm()

    await wrapper.get('[data-testid="entry-link-form-candidate-ref"]').setValue('cand-1')
    await wrapper.get('[data-testid="entry-link-form-display-name"]').setValue('Mario Rossi')
    await wrapper.get('[data-testid="entry-link-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="entry-link-form-email-error"]').exists()).toBe(true)
    expect(generateEntryLinkMock).not.toHaveBeenCalled()
  })

  it('catches the obvious typo and nothing cleverer', async () => {
    // Presence and a single `@`. A thorough client-side regex rejects
    // addresses that are perfectly valid — plus addressing, new TLDs, quoted
    // locals — and the person it turns away is a candidate who then never gets
    // invited at all. The server is the authority.
    const wrapper = mountForm()

    await wrapper.get('[data-testid="entry-link-form-candidate-ref"]').setValue('cand-1')
    await wrapper.get('[data-testid="entry-link-form-display-name"]').setValue('Mario Rossi')
    await wrapper.get('[data-testid="entry-link-form-email"]').setValue('not-an-address')
    await wrapper.get('[data-testid="entry-link-form"]').trigger('submit')
    await flushPromises()

    expect(wrapper.find('[data-testid="entry-link-form-email-error"]').exists()).toBe(true)
    expect(generateEntryLinkMock).not.toHaveBeenCalled()
  })

  it('accepts an address a stricter regex would have rejected', async () => {
    const wrapper = mountForm()

    await wrapper.get('[data-testid="entry-link-form-candidate-ref"]').setValue('cand-1')
    await wrapper.get('[data-testid="entry-link-form-display-name"]').setValue('Mario Rossi')
    await wrapper
      .get('[data-testid="entry-link-form-email"]')
      .setValue('mario+recruiting@sub.example.engineering')
    await wrapper.get('[data-testid="entry-link-form"]').trigger('submit')
    await flushPromises()

    expect(generateEntryLinkMock).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'mario+recruiting@sub.example.engineering' })
    )
  })
})
