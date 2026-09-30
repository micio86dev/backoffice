/**
 * CopyTemplateDialog — copy one avatar template to other organizations
 * (DESIGN.md §16.15). The dialog teleports to `document.body`, so everything
 * is queried there.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { realI18n } from '../../support/i18n'
import { waitFor, waitForTestId } from '../../support/wait-for'

const duplicateTemplate = vi.fn()
const fetchClients = vi.fn()

vi.mock('../../../../app/composables/useAvatarTemplates', () => ({
  useAvatarTemplates: () => ({ duplicateTemplate }),
}))
vi.mock('../../../../app/composables/useSuperadmin', () => ({
  useSuperadmin: () => ({ fetchClients }),
}))

const CopyTemplateDialog = (
  await import('../../../../app/components/organisms/CopyTemplateDialog.vue')
).default

const tMock = (key: string, params?: Record<string, unknown>) =>
  params ? `${key} ${JSON.stringify(params)}` : key

vi.stubGlobal(
  'useI18n',
  vi.fn(() => ({ ...realI18n(), t: tMock, locale: ref('it') }))
)

const template = { id: 7, name: 'Recruiter voice' }

const CLIENTS = {
  data: [
    { id: 1, name: 'Source Org' },
    { id: 2, name: 'Beta Org' },
    { id: 3, name: 'Gamma Org' },
  ],
  acting_organization_id: 1,
}

function q<T extends HTMLElement = HTMLElement>(testId: string): T | null {
  return document.body.querySelector<T>(`[data-testid="${testId}"]`)
}

async function click(testId: string): Promise<void> {
  const el = await waitForTestId(testId)
  el.click()
  await flushPromises()
}

async function mountOpen(scope?: 'platform' | 'organization') {
  const wrapper = mount(CopyTemplateDialog, {
    props: { open: true, template, ...(scope === undefined ? {} : { scope }) },
    global: { mocks: { $t: tMock } },
    attachTo: document.body,
  })
  await waitForTestId('org-multiselect')
  return wrapper
}

beforeEach(() => {
  duplicateTemplate.mockReset()
  fetchClients.mockReset()
  fetchClients.mockResolvedValue(CLIENTS)
})

afterEach(() => {
  document.body.innerHTML = ''
})

describe('CopyTemplateDialog', () => {
  it('lists every organization EXCEPT the source (the acting client)', async () => {
    await mountOpen()

    expect(q('org-option-1')).toBeNull()
    expect(q('org-option-2')).not.toBeNull()
    expect(q('org-option-3')).not.toBeNull()
    expect(document.body.textContent).toContain('Recruiter voice')
  })

  it('keeps submit disabled, with the reason referenced, until something is selected', async () => {
    await mountOpen()
    const submit = q<HTMLButtonElement>('copy-template-submit')!
    const hint = q('copy-template-submit-hint')!

    expect(submit.disabled).toBe(true)
    expect(hint.textContent).toContain('avatar_templates.copy.submitNone')
    expect(submit.getAttribute('aria-describedby')).toBe(hint.id)

    await click('org-option-2')

    expect(q<HTMLButtonElement>('copy-template-submit')!.disabled).toBe(false)
    expect(q('copy-template-submit-hint')).toBeNull()
  })

  it('select all picks every listed organization and submits them in order', async () => {
    duplicateTemplate.mockResolvedValue({ data: [] })
    await mountOpen()

    await click('org-select-all')
    await click('copy-template-submit')

    expect(duplicateTemplate).toHaveBeenCalledWith(7, [2, 3], '', 'organization')
  })

  it('sends the optional name override', async () => {
    duplicateTemplate.mockResolvedValue({ data: [] })
    await mountOpen()

    await click('org-option-3')
    const input = q<HTMLInputElement>('copy-template-name')!
    input.value = 'Shared voice'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await click('copy-template-submit')

    expect(duplicateTemplate).toHaveBeenCalledWith(7, [3], 'Shared voice', 'organization')
  })

  it('shows a loading state and blocks a second submit while the request runs', async () => {
    let resolve!: (value: unknown) => void
    duplicateTemplate.mockReturnValue(new Promise((r) => (resolve = r)))
    await mountOpen()

    await click('org-option-2')
    await click('copy-template-submit')

    const submit = q<HTMLButtonElement>('copy-template-submit')!
    expect(submit.disabled).toBe(true)
    expect(submit.getAttribute('aria-busy')).toBe('true')
    expect(submit.textContent).toContain('avatar_templates.copy.submitting')

    resolve({ data: [] })
    await flushPromises()
  })

  it('reports each created copy, says they are inactive, and moves focus to the summary', async () => {
    duplicateTemplate.mockResolvedValue({
      data: [
        { organization_id: 2, id: 90, name: 'Recruiter voice' },
        { organization_id: 3, id: 91, name: 'Recruiter voice (copy)' },
      ],
    })
    await mountOpen()

    await click('org-select-all')
    await click('copy-template-submit')

    const result = await waitForTestId('copy-template-result')
    expect(result.getAttribute('role')).toBe('status')
    expect(result.textContent).toContain('"organization":"Beta Org"')
    expect(result.textContent).toContain('"name":"Recruiter voice (copy)"')
    expect(result.textContent).toContain('avatar_templates.copy.resultInactive')
    expect(q('org-multiselect')).toBeNull()
    await waitFor(
      () => document.activeElement === q('copy-template-result-title'),
      'focus on the result heading'
    )
  })

  it.each([
    ['source_organization_included'],
    ['source_config_invalid'],
    ['forbidden'],
    ['template_not_found'],
  ])('renders the translated %s failure in an alert and keeps the selection', async (code) => {
    duplicateTemplate.mockRejectedValue(Object.assign(new Error(code), { code }))
    await mountOpen()

    await click('org-option-2')
    await click('copy-template-submit')

    const alert = await waitForTestId('copy-template-error')
    expect(alert.getAttribute('role')).toBe('alert')
    expect(alert.textContent).toContain(`avatar_templates.serverError.${code}`)
    expect(q('org-option-2')!.getAttribute('aria-checked')).toBe('true')
    expect(q<HTMLButtonElement>('copy-template-submit')!.disabled).toBe(false)
  })

  it('places a name refusal on the name field, without a banner repeating it', async () => {
    duplicateTemplate.mockRejectedValue(
      Object.assign(new Error('validation_failed'), {
        code: 'validation_failed',
        cause: { data: { errors: { name: ['name_too_long'] } } },
      })
    )
    await mountOpen()

    await click('org-option-2')
    await click('copy-template-submit')

    expect((await waitForTestId('copy-template-name-error')).textContent).toContain('name_too_long')
    expect(q('copy-template-error')).toBeNull()
    expect(q('copy-template-name')!.getAttribute('aria-invalid')).toBe('true')
  })

  it('falls back to the generic copy failure for an error it does not know', async () => {
    duplicateTemplate.mockRejectedValue(new Error('network'))
    await mountOpen()

    await click('org-option-2')
    await click('copy-template-submit')

    expect((await waitForTestId('copy-template-error')).textContent).toContain(
      'avatar_templates.serverError.duplicate_failed'
    )
  })

  it('says so when the organizations cannot be loaded, and offers nothing to submit', async () => {
    fetchClients.mockRejectedValue(new Error('boom'))
    mount(CopyTemplateDialog, {
      props: { open: true, template },
      global: { mocks: { $t: tMock } },
      attachTo: document.body,
    })

    const alert = await waitForTestId('copy-template-load-error')
    expect(alert.textContent).toContain('avatar_templates.copy.loadError')
    expect(q('copy-template-submit')).toBeNull()
  })

  it('emits update:open=false on cancel', async () => {
    const wrapper = await mountOpen()

    await click('copy-template-cancel')

    expect(wrapper.emitted('update:open')?.at(-1)).toEqual([false])
  })

  it('starts from a clean slate each time it is opened', async () => {
    duplicateTemplate.mockResolvedValue({ data: [{ organization_id: 2, id: 90, name: 'X' }] })
    const wrapper = await mountOpen()
    await click('org-option-2')
    await click('copy-template-submit')
    await waitForTestId('copy-template-result')

    await wrapper.setProps({ open: false })
    await wrapper.setProps({ open: true })

    await waitForTestId('org-multiselect')
    expect(q('copy-template-result')).toBeNull()
    expect(q('org-option-2')!.getAttribute('aria-checked')).toBe('false')
  })

  describe('copying FROM a platform template (scope="platform")', () => {
    it('offers EVERY organization, the acting one included: a global has no source organization', async () => {
      await mountOpen('platform')

      expect(q('org-option-1')).not.toBeNull()
      expect(q('org-option-2')).not.toBeNull()
      expect(q('org-option-3')).not.toBeNull()
    })

    it('labels the source with the Platform badge and says the copy is independent', async () => {
      await mountOpen('platform')

      expect(q('copy-template-platform-badge')?.textContent).toContain('platformTemplates.badge')
      expect(q('copy-template-independence')?.textContent).toContain(
        'avatar_templates.copy.platformIndependent'
      )
    })

    it('copies through the platform route by passing the scope on', async () => {
      duplicateTemplate.mockResolvedValue({ data: [] })
      await mountOpen('platform')

      await click('org-option-1')
      await click('copy-template-submit')

      expect(duplicateTemplate).toHaveBeenCalledWith(7, [1], '', 'platform')
    })

    it('shows neither the badge nor the notice for an organization template', async () => {
      await mountOpen()

      expect(q('copy-template-platform-badge')).toBeNull()
      expect(q('copy-template-independence')).toBeNull()
    })
  })
})
