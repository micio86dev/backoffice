/**
 * The three tenant-scoped write entry points a superadmin with NO acting client
 * cannot complete (avatar-template create, avatar-template import, project
 * question create) — the API answers them 409 `organization_context_required`.
 *
 * Each must, in that state, show ONE shared notice, disable its action and
 * point the disabled control at the notice via aria-describedby. In the normal
 * state (regular org user, or a superadmin acting as a client) nothing changes.
 */
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { realI18n } from './support/i18n'
import { withTooltipProvider } from './support/tooltip-host'

const NOTICE_ID = 'acting-client-required-notice'
const tMock = (key: string, params?: Record<string, unknown>) =>
  params ? `${key} ${JSON.stringify(params)}` : key

const required = ref(false)

vi.mock('../../app/composables/useActingClientRequired', () => ({
  ACTING_CLIENT_NOTICE_ID: 'acting-client-required-notice',
  useActingClientRequired: () => ({ actingClientRequired: required }),
}))

vi.stubGlobal('useI18n', () => realI18n())

beforeEach(() => {
  required.value = false
  document.body.innerHTML = ''
  vi.stubGlobal('useI18n', () => realI18n())
})

describe('TemplatePortability import', () => {
  async function mountIt() {
    const { default: TemplatePortability } =
      await import('../../app/components/organisms/TemplatePortability.vue')

    return mount(TemplatePortability, {
      props: { isAdmin: true, importBlocked: required.value },
      global: { mocks: { $t: tMock } },
    })
  }

  it('is enabled and undescribed in the normal state', async () => {
    const button = (await mountIt()).get('[data-testid="template-import"]')

    expect(button.attributes('disabled')).toBeUndefined()
    expect(button.attributes('aria-describedby')).toBeUndefined()
  })

  it('is disabled and described by the notice when a client is required', async () => {
    required.value = true
    const button = (await mountIt()).get('[data-testid="template-import"]')

    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('aria-describedby')).toBe(NOTICE_ID)
  })
})

describe('QuestionListEditor add', () => {
  async function mountIt(addBlocked: boolean) {
    const { default: QuestionListEditor } =
      await import('../../app/components/organisms/QuestionListEditor.vue')

    return mount(QuestionListEditor, {
      props: {
        competencies: [{ id: 11, label: 'COL' }],
        questions: [],
        locale: 'en',
        cap: null,
        saving: false,
        submitError: null,
        addBlocked,
      },
      global: { mocks: { $t: tMock }, stubs: { ConfirmDialog: true } },
    })
  }

  it('disables Add and describes it by the notice when blocked', async () => {
    const button = (await mountIt(true)).get('[data-testid="question-add-11"]')

    expect(button.attributes('disabled')).toBeDefined()
    expect(button.attributes('aria-describedby')).toBe(NOTICE_ID)
  })

  it('leaves Add alone when not blocked', async () => {
    const button = (await mountIt(false)).get('[data-testid="question-add-11"]')

    expect(button.attributes('disabled')).toBeUndefined()
    expect(button.attributes('aria-describedby')).toBeUndefined()
  })
})

describe('ProjectQuestionsPanel', () => {
  async function mountIt() {
    vi.doMock('../../app/composables/useProjectQuestions', () => ({
      useProjectQuestions: () => ({
        fetchQuestions: vi.fn().mockResolvedValue({ data: [], meta: {} }),
        createQuestion: vi.fn(),
        updateQuestion: vi.fn(),
        deleteQuestion: vi.fn(),
        reorderQuestions: vi.fn(),
      }),
    }))
    const { default: Panel } =
      await import('../../app/components/organisms/ProjectQuestionsPanel.vue')
    const wrapper = mount(Panel, {
      props: { projectId: 5, competencies: [{ id: 11, code: 'COL' }], locale: 'en' },
      global: { mocks: { $t: tMock }, stubs: { ConfirmDialog: true } },
    })
    await flushPromises()

    return wrapper
  }

  it('shows the status notice and blocks Add when a client is required', async () => {
    required.value = true
    const wrapper = await mountIt()

    expect(wrapper.get('[data-testid="acting-client-notice"]').attributes('role')).toBe('status')
    expect(wrapper.get('[data-testid="question-add-11"]').attributes('disabled')).toBeDefined()
  })

  it('shows no notice in the normal state', async () => {
    const wrapper = await mountIt()

    expect(wrapper.find('[data-testid="acting-client-notice"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="question-add-11"]').attributes('disabled')).toBeUndefined()
  })
})

describe('avatar-templates page', () => {
  async function mountIt() {
    vi.doMock('../../app/composables/useCurrentUser', () => ({
      useCurrentUser: () => ({
        can: () => true,
        ensureLoaded: vi.fn().mockResolvedValue(undefined),
      }),
    }))
    vi.doMock('../../app/composables/useAvatarTemplates', () => ({
      useAvatarTemplates: () => ({
        listTemplates: vi.fn().mockResolvedValue({ data: [] }),
        fetchFieldSpecs: vi.fn().mockResolvedValue({ data: {} }),
      }),
    }))
    const Page = (await import('../../app/pages/avatar-templates/index.vue')).default
    const wrapper = mount(withTooltipProvider(Page), { global: { mocks: { $t: tMock } } })
    await flushPromises()

    return wrapper
  }

  it('shows the notice, disables New and Import when a client is required', async () => {
    required.value = true
    const wrapper = await mountIt()
    const createButton = wrapper.get('[data-testid="template-new"]')

    expect(wrapper.get('[data-testid="acting-client-notice"]').attributes('role')).toBe('status')
    expect(createButton.attributes('disabled')).toBeDefined()
    expect(createButton.attributes('aria-describedby')).toBe(NOTICE_ID)
    expect(wrapper.get('[data-testid="template-import"]').attributes('disabled')).toBeDefined()
  })

  it('is unchanged in the normal state', async () => {
    const wrapper = await mountIt()

    expect(wrapper.find('[data-testid="acting-client-notice"]').exists()).toBe(false)
    expect(wrapper.get('[data-testid="template-new"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('[data-testid="template-import"]').attributes('disabled')).toBeUndefined()
  })
})

describe('a 409 that slipped past the guard', () => {
  it('QuestionListEditor reports the translated code, not "try again shortly"', async () => {
    const { default: QuestionListEditor } =
      await import('../../app/components/organisms/QuestionListEditor.vue')
    const wrapper = mount(QuestionListEditor, {
      props: {
        competencies: [{ id: 11, label: 'COL' }],
        questions: [],
        locale: 'en',
        cap: null,
        saving: false,
        submitError: null,
      },
      global: { mocks: { $t: tMock }, stubs: { ConfirmDialog: true } },
    })

    await wrapper.setProps({
      submitError: { status: 409, data: { message: 'organization_context_required' } },
    })

    expect(wrapper.emitted('unmapped-error')?.at(-1)?.[0]).toEqual({
      kind: 'error',
      text: 'serverError.organization_context_required',
    })
  })
})
