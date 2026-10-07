/**
 * pages/platform-templates/index.vue — the superadmin's management page for
 * platform (global) avatar templates (global-avatar-templates, slice B2).
 *
 * What is asserted is what an operator would get wrong without it: nothing is
 * sent before the usage warning is confirmed, the two 409 refusals read as
 * themselves (with the API's counts), and a disabled delete says why.
 * Written AFTER the composable and the dialog it wires, against the spec
 * scenarios of the admin-backoffice delta; each was seen failing before the
 * page existed (module missing) and again under the mutations listed in the
 * apply-progress.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { confirmDialog } from './support/confirm'
import { englishI18n } from './support/i18n'
import { withTooltipProvider } from './support/tooltip-host'
import { waitForTestId } from './support/wait-for'

function template(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    name: 'Studio voice',
    description: null,
    provider: 'heygen',
    scope: 'platform',
    config: { avatarId: 'av_1' },
    is_active: false,
    created_at: null,
    updated_at: null,
    llm_model_id: null,
    llm_credential_id: null,
    llm_sync_status: null,
    llm_synced_at: null,
    llm: { estimated_cost_usd_per_interview: null },
    pal_sync: { status: null, code: null, synced_at: null },
    usage: { organization_count: 0, project_count: 0 },
    ...overrides,
  }
}

const IN_USE = { organization_count: 2, project_count: 5 }

const SPECS = {
  heygen: [
    { key: 'avatarId', type: 'text', label_key: 'avatar_templates.field.avatarId' },
    { key: 'enableCaptions', type: 'checkbox', label_key: 'avatar_templates.field.avatarId' },
  ],
  tavus: [],
}

const orgFieldSpecs = vi.fn().mockResolvedValue({ data: { heygen: [], tavus: [] } })

type Errors = typeof import('../../app/composables/usePlatformAvatarTemplates')

async function mountPage(
  rows: unknown[] = [template()],
  handlers: (errors: Errors) => Record<string, unknown> = () => ({})
) {
  let api: Record<string, ReturnType<typeof vi.fn>> = {}
  vi.doMock('../../app/composables/usePlatformAvatarTemplates', async (original) => ({
    ...(await original<object>()),
    usePlatformAvatarTemplates: () => api,
  }))
  // The MOCKED module, so `instanceof` in the page sees these very classes.
  const errors = await import('../../app/composables/usePlatformAvatarTemplates')
  api = {
    list: vi.fn().mockResolvedValue({ data: rows }),
    fetchFieldSpecs: vi.fn().mockResolvedValue({ data: SPECS }),
    get: vi.fn(),
    create: vi.fn().mockResolvedValue({ data: template() }),
    update: vi.fn().mockResolvedValue({ data: template() }),
    activate: vi.fn().mockResolvedValue({ data: template({ is_active: true }) }),
    deactivate: vi.fn().mockResolvedValue({ data: template() }),
    remove: vi.fn().mockResolvedValue(undefined),
    ...handlers(errors),
  }
  vi.doMock('../../app/composables/useSuperadmin', () => ({
    useSuperadmin: () => ({
      fetchClients: vi
        .fn()
        .mockResolvedValue({ data: [{ id: 2, name: 'Beta Org' }], acting_organization_id: null }),
    }),
  }))
  vi.doMock('../../app/composables/useAvatarTemplates', () => ({
    useAvatarTemplates: () => ({
      // The ORGANIZATION route, which must NOT be what this page loads its form from.
      fetchFieldSpecs: orgFieldSpecs,
      duplicateTemplate: vi.fn().mockResolvedValue({ data: [] }),
    }),
  }))

  const Page = (await import('../../app/pages/platform-templates/index.vue')).default
  const wrapper = mount(withTooltipProvider(Page), {
    global: { mocks: { $t: englishI18n().t } },
    attachTo: document.body,
  })
  await flushPromises()

  return { wrapper, api }
}

const dialogText = (): string =>
  document.body.querySelector('[role="alertdialog"]')?.textContent ?? ''

async function click(wrapper: Awaited<ReturnType<typeof mountPage>>['wrapper'], testId: string) {
  await wrapper.find(`[data-testid="${testId}"]`).trigger('click')
  await flushPromises()
}

const nameInput = (): HTMLInputElement | null =>
  document.body.querySelector<HTMLInputElement>('#template-name')

async function submitForm(): Promise<void> {
  const form = await waitForTestId<HTMLFormElement>('template-form')
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  await flushPromises()
}

describe('PlatformTemplatesPage', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.stubGlobal('definePageMeta', vi.fn())
    vi.stubGlobal('useHead', vi.fn())
    vi.stubGlobal('useI18n', () => englishI18n())
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  describe('field specs', () => {
    it('loads the form from the PLATFORM route (which lists the external voice fields), never the organization one', async () => {
      orgFieldSpecs.mockClear()
      const { api } = await mountPage()

      expect(api.fetchFieldSpecs).toHaveBeenCalledTimes(1)
      expect(orgFieldSpecs).not.toHaveBeenCalled()
    })
  })

  describe('list', () => {
    it('shows the Platform badge, provider, state and usage for every row', async () => {
      const { wrapper, api } = await mountPage([
        template({ id: 1, name: 'Studio voice', is_active: true, usage: IN_USE }),
        template({ id: 2, name: 'Old voice', provider: 'tavus', is_active: false }),
      ])

      expect(api.list).toHaveBeenCalledTimes(1)
      const first = wrapper.find('[data-testid="platform-template-row-1"]').text()
      expect(first).toContain('Studio voice')
      expect(first).toContain('Platform')
      expect(first).toContain('HeyGen')
      expect(wrapper.find('[data-testid="platform-template-state-1"]').text()).toBe('Offered')
      expect(wrapper.find('[data-testid="platform-template-usage-1"]').text()).toBe(
        '2 organizations / 5 projects'
      )
      expect(wrapper.find('[data-testid="platform-template-state-2"]').text()).toBe('Retired')
      expect(wrapper.find('[data-testid="platform-template-row-2"]').text()).toContain('Tavus')
    })

    it('flags a failed Tavus persona sync on the row that has it, and only there', async () => {
      const { wrapper } = await mountPage([
        template({
          id: 1,
          provider: 'tavus',
          pal_sync: { status: 'warning', code: 'pal_sync_failed', synced_at: null },
        }),
        template({
          id: 2,
          provider: 'tavus',
          pal_sync: { status: 'synced', code: null, synced_at: null },
        }),
      ])

      expect(
        wrapper
          .find('[data-testid="platform-template-row-1"] [data-testid="pal-sync"]')
          .attributes('data-status')
      ).toBe('warning')
      expect(
        wrapper
          .find('[data-testid="platform-template-row-2"] [data-testid="pal-sync"]')
          .attributes('data-status')
      ).toBe('synced')
    })

    it('flags a failed LLM sync on the row that has it, and only there', async () => {
      const { wrapper } = await mountPage([
        template({ id: 1, llm_sync_status: 'failed' }),
        template({ id: 2, llm_sync_status: 'synced' }),
      ])

      expect(wrapper.find('[data-testid="platform-template-llm-sync-failed-1"]').exists()).toBe(
        true
      )
      expect(wrapper.find('[data-testid="platform-template-llm-sync-failed-2"]').exists()).toBe(
        false
      )
    })

    it('paints the row hover in the primary family, never the brand orange', async () => {
      const { wrapper } = await mountPage()

      // DESIGN.md §16.17. The one class assertion here is deliberate: the rule
      // IS a colour choice, and the theme scan cannot see a wrong token.
      const classes = wrapper.find('[data-testid="platform-template-row-1"]').classes()
      expect(classes).toContain('hover:bg-primary/10')
      expect(classes.some((name) => /accent|orange/.test(name))).toBe(false)
    })
  })

  describe('load failure', () => {
    it('says so in an alert and renders neither an empty list nor the empty state', async () => {
      const { wrapper } = await mountPage(undefined, () => ({
        list: vi.fn().mockRejectedValue(new Error('offline')),
      }))

      expect(wrapper.find('[data-testid="platform-templates-load-error"]').attributes('role')).toBe(
        'alert'
      )
      expect(wrapper.find('[data-testid="platform-templates-list"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="platform-templates-empty"]').exists()).toBe(false)
    })
  })

  describe('create and edit reuse AvatarTemplateForm', () => {
    it('renders booleans as CheckboxField, never a raw checkbox input', async () => {
      const { wrapper } = await mountPage()

      await click(wrapper, 'platform-template-new')
      await waitForTestId('template-form')

      expect(document.body.querySelectorAll('[data-slot="checkbox-field"]').length).toBe(1)
      expect(document.body.querySelectorAll('input[type="checkbox"]').length).toBe(0)
    })

    it('creates a platform template through the composable and reloads the list', async () => {
      const { wrapper, api } = await mountPage([])

      await click(wrapper, 'platform-template-new')
      await waitForTestId('template-form')
      const name = nameInput()!
      name.value = 'Fresh voice'
      name.dispatchEvent(new Event('input', { bubbles: true }))
      await submitForm()

      expect(api.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Fresh voice', provider: 'heygen' })
      )
      expect(api.list).toHaveBeenCalledTimes(2)
    })

    it('saves an edit straight away when nothing uses the template', async () => {
      const { wrapper, api } = await mountPage([
        template({ usage: { organization_count: 0, project_count: 0 } }),
      ])

      await click(wrapper, 'platform-template-edit-1')
      await submitForm()

      expect(api.update).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'Studio voice' }))
      expect(dialogText()).toBe('')
    })

    it('sends NO update for an in-use template until the usage warning is confirmed', async () => {
      const { wrapper, api } = await mountPage([template({ usage: IN_USE })])

      await click(wrapper, 'platform-template-edit-1')
      await submitForm()

      expect(api.update).not.toHaveBeenCalled()
      expect(dialogText()).toContain('2 organizations / 5 projects use this template')

      await confirmDialog('confirm')

      expect(api.update).toHaveBeenCalledWith(1, expect.objectContaining({ name: 'Studio voice' }))
    })

    it('cancelling the warning sends nothing and keeps the form open with its values', async () => {
      const { wrapper, api } = await mountPage([template({ usage: IN_USE })])

      await click(wrapper, 'platform-template-edit-1')
      await submitForm()
      await confirmDialog('cancel')

      expect(api.update).not.toHaveBeenCalled()
      expect(nameInput()?.value).toBe('Studio voice')
    })
  })

  describe('offer and retire', () => {
    it('offers straight away and announces the result in a status region', async () => {
      const { wrapper, api } = await mountPage()

      await click(wrapper, 'platform-template-offer-1')

      expect(api.activate).toHaveBeenCalledWith(1)
      expect(api.list).toHaveBeenCalledTimes(2)
      expect(wrapper.find('[data-testid="platform-template-notice"]').attributes('role')).toBe(
        'status'
      )
    })

    it('shows Offer for a retired template and Retire for an offered one', async () => {
      const { wrapper } = await mountPage([
        template({ id: 1, is_active: false }),
        template({ id: 2, is_active: true }),
      ])

      expect(wrapper.find('[data-testid="platform-template-offer-1"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="platform-template-retire-1"]').exists()).toBe(false)
      expect(wrapper.find('[data-testid="platform-template-retire-2"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="platform-template-offer-2"]').exists()).toBe(false)
    })

    it('warns before retiring a template that is in use, and retires only once confirmed', async () => {
      const { wrapper, api } = await mountPage([template({ is_active: true, usage: IN_USE })])

      await click(wrapper, 'platform-template-retire-1')

      expect(api.deactivate).not.toHaveBeenCalled()
      expect(dialogText()).toContain('2 organizations / 5 projects use this template')

      await confirmDialog('confirm')

      expect(api.deactivate).toHaveBeenCalledWith(1)
    })

    it('retires an unused template without a dialog', async () => {
      const { wrapper, api } = await mountPage([template({ is_active: true })])

      await click(wrapper, 'platform-template-retire-1')

      expect(api.deactivate).toHaveBeenCalledWith(1)
      expect(dialogText()).toBe('')
    })
  })

  describe('delete', () => {
    it('is disabled while the template is in use, with the reason in text and referenced', async () => {
      const { wrapper } = await mountPage([template({ usage: IN_USE })])

      const button = wrapper.find('[data-testid="platform-template-delete-1"]')
      const reason = wrapper.find('[data-testid="platform-template-delete-reason-1"]')

      expect(button.attributes('disabled')).toBeDefined()
      expect(button.attributes('aria-describedby')).toBe(reason.attributes('id'))
      expect(reason.text()).toContain('2 organizations / 5 projects')
    })

    it('deletes an unused template only after confirming, which states irreversibility', async () => {
      const { wrapper, api } = await mountPage()

      await click(wrapper, 'platform-template-delete-1')

      expect(api.remove).not.toHaveBeenCalled()
      expect(dialogText()).toContain('cannot be undone')

      await confirmDialog('confirm')

      expect(api.remove).toHaveBeenCalledWith(1)
    })

    it('renders the API counts from a 409 template_in_use, not a generic error', async () => {
      // Usage read as zero (stale list), the server knows better.
      const { wrapper } = await mountPage(undefined, (errors) => ({
        remove: vi.fn().mockRejectedValue(new errors.PlatformTemplateInUseError(2, 3, null)),
      }))

      await click(wrapper, 'platform-template-delete-1')
      await confirmDialog('confirm')

      const alert = wrapper.find('[data-testid="platform-template-error"]')
      expect(alert.attributes('role')).toBe('alert')
      expect(alert.text()).toContain('2 organizations / 3 projects still use this template')
      expect(alert.text()).not.toContain('Something went wrong')
    })

    it('tells the operator to retire first on a 409 template_active', async () => {
      const { wrapper } = await mountPage([template({ is_active: true })], (errors) => ({
        remove: vi.fn().mockRejectedValue(new errors.PlatformTemplateActiveError(null)),
      }))

      await click(wrapper, 'platform-template-delete-1')
      await confirmDialog('confirm')

      expect(wrapper.find('[data-testid="platform-template-error"]').text()).toContain(
        'Retire it first'
      )
    })

    it('reads any other failure through the shared resource states', async () => {
      const forbidden = Object.assign(new Error('forbidden'), { status: 403 })
      const { wrapper } = await mountPage(undefined, () => ({
        remove: vi.fn().mockRejectedValue(forbidden),
      }))

      await click(wrapper, 'platform-template-delete-1')
      await confirmDialog('confirm')

      expect(wrapper.find('[data-testid="platform-template-error"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="platform-template-error"]').text()).not.toContain(
        'projects still use'
      )
    })
  })

  describe('copy to organizations', () => {
    it('opens the copy dialog for the clicked row, as a platform source', async () => {
      const { wrapper } = await mountPage([
        template({ id: 1, name: 'Studio voice' }),
        template({ id: 2, name: 'Other' }),
      ])

      await click(wrapper, 'platform-template-copy-2')
      await waitForTestId('copy-template-dialog')

      expect(
        document.body.querySelector('[data-testid="copy-template-dialog"]')?.textContent
      ).toContain('Other')
      expect(
        document.body.querySelector('[data-testid="copy-template-platform-badge"]')
      ).not.toBeNull()
    })
  })

  describe('write safety', () => {
    it('sends one activation for a double click on Offer', async () => {
      let release: () => void = () => undefined
      const { wrapper, api } = await mountPage([template()], () => ({
        activate: vi.fn().mockReturnValue(new Promise<void>((resolve) => (release = resolve))),
      }))

      const offer = wrapper.find('[data-testid="platform-template-offer-1"]')
      await offer.trigger('click')
      await offer.trigger('click')
      release()
      await flushPromises()

      expect(api.activate).toHaveBeenCalledTimes(1)
    })

    it('ignores a save while an offer is in flight, and disables the form meanwhile', async () => {
      let release: () => void = () => undefined
      const { wrapper, api } = await mountPage([template()], () => ({
        activate: vi.fn().mockReturnValue(new Promise<void>((resolve) => (release = resolve))),
      }))
      await click(wrapper, 'platform-template-edit-1')
      await wrapper.find('[data-testid="platform-template-offer-1"]').trigger('click')

      const form = await waitForTestId<HTMLFormElement>('template-form')
      expect(form.querySelector('fieldset')?.disabled).toBe(true)
      await submitForm()
      expect(api.update).not.toHaveBeenCalled()

      release()
      await flushPromises()
    })

    it('disables Offer and ignores a second write while a save is in flight', async () => {
      let release: () => void = () => undefined
      const { wrapper, api } = await mountPage([template()], () => ({
        update: vi
          .fn()
          .mockReturnValue(
            new Promise<object>((resolve) => (release = () => resolve({ data: template() })))
          ),
      }))
      await click(wrapper, 'platform-template-edit-1')
      await submitForm()

      const offer = wrapper.find('[data-testid="platform-template-offer-1"]')
      expect((offer.element as HTMLButtonElement).disabled).toBe(true)
      await submitForm()
      expect(api.update).toHaveBeenCalledTimes(1)

      release()
      await flushPromises()
    })

    it('does not show stale rows when the reload after a write fails', async () => {
      const { wrapper, api } = await mountPage([template()])
      api.list.mockRejectedValueOnce(new Error('boom'))

      await click(wrapper, 'platform-template-offer-1')

      expect(wrapper.find('[data-testid="platform-templates-load-error"]').exists()).toBe(true)
      expect(wrapper.find('[data-testid="platform-template-row-1"]').exists()).toBe(false)
    })

    it('clears a previous notice when a save starts', async () => {
      const { wrapper, api } = await mountPage([template()])
      await click(wrapper, 'platform-template-offer-1')
      expect(wrapper.find('[data-testid="platform-template-notice"]').exists()).toBe(true)
      api.update.mockRejectedValueOnce(new Error('nope'))

      await click(wrapper, 'platform-template-edit-1')
      await submitForm()

      expect(wrapper.find('[data-testid="platform-template-notice"]').exists()).toBe(false)
    })
  })
})
