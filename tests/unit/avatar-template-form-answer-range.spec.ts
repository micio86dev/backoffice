/**
 * AvatarTemplateForm — the "good answer" range (`answer_min_seconds` /
 * `answer_max_seconds`). The api owns the rule (integers, 10..600, min < max);
 * the form mirrors it for fast feedback and maps the server refusal onto the
 * field it names, with its own copy.
 */
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AvatarTemplateForm from '../../app/components/organisms/AvatarTemplateForm.vue'
import type { FieldSpec, ProviderName } from '../../app/types/avatar-template'
import en from '../../i18n/locales/en.json'
import it_ from '../../i18n/locales/it.json'

const SPECS: Record<ProviderName, FieldSpec[]> = {
  heygen: [{ key: 'voiceId', type: 'text', label_key: 'avatar_templates.field.voiceId' }],
  tavus: [],
}

const MIN = '[data-testid="template-field-answer-min-seconds"]'
const MAX = '[data-testid="template-field-answer-max-seconds"]'
const MIN_ERROR = '[data-testid="template-answer-min-seconds-error"]'
const MAX_ERROR = '[data-testid="template-answer-max-seconds-error"]'

function mountForm(template: Record<string, unknown> = {}, submitError: unknown = null) {
  return mount(AvatarTemplateForm, {
    props: {
      template: { name: 'Test template', provider: 'heygen', config: {}, ...template },
      fieldSpecs: SPECS,
      saving: false,
      submitError,
    },
    global: { mocks: { $t: (key: string) => key } },
  })
}

type Payload = { answer_min_seconds?: number; answer_max_seconds?: number }

async function submitted(wrapper: ReturnType<typeof mountForm>): Promise<Payload | undefined> {
  await wrapper.find('form').trigger('submit')

  return wrapper.emitted('submit')?.[0]?.[0] as Payload | undefined
}

const value = (wrapper: ReturnType<typeof mountForm>, selector: string) =>
  (wrapper.get(selector).element as HTMLInputElement).value

describe('the answer range inputs', () => {
  it('are labelled, described and numeric', () => {
    const wrapper = mountForm()

    for (const [selector, label, hint] of [
      [MIN, 'answer_min_seconds', 'answer_min_seconds_hint'],
      [MAX, 'answer_max_seconds', 'answer_max_seconds_hint'],
    ]) {
      const input = wrapper.get(selector)
      expect(input.attributes('type')).toBe('number')
      expect(wrapper.get(`label[for="${input.attributes('id')}"]`).text()).toContain(
        `avatar_templates.form.${label}`
      )
      const describedBy = input.attributes('aria-describedby') ?? ''
      expect(wrapper.get(`#${describedBy.split(' ')[0]}`).text()).toContain(
        `avatar_templates.form.${hint}`
      )
    }
  })

  it('default to 90 and 150 on a new template', () => {
    const wrapper = mountForm()

    expect(value(wrapper, MIN)).toBe('90')
    expect(value(wrapper, MAX)).toBe('150')
  })

  it('load the stored values when editing', () => {
    const wrapper = mountForm({ id: 4, answer_min_seconds: 60, answer_max_seconds: 200 })

    expect(value(wrapper, MIN)).toBe('60')
    expect(value(wrapper, MAX)).toBe('200')
  })

  it('fall back to the defaults for a response that predates them', () => {
    const wrapper = mountForm({ id: 4 })

    expect(value(wrapper, MIN)).toBe('90')
    expect(value(wrapper, MAX)).toBe('150')
  })
})

describe('the payload', () => {
  it('carries the defaults untouched', async () => {
    const payload = await submitted(mountForm())

    expect(payload).toMatchObject({ answer_min_seconds: 90, answer_max_seconds: 150 })
  })

  it('carries the edited values as integers', async () => {
    const wrapper = mountForm({ id: 4, answer_min_seconds: 60, answer_max_seconds: 200 })

    await wrapper.get(MIN).setValue('45')
    await wrapper.get(MAX).setValue('180')

    expect(await submitted(wrapper)).toMatchObject({
      answer_min_seconds: 45,
      answer_max_seconds: 180,
    })
  })
})

describe('client validation', () => {
  it.each([
    ['min below 10', '9', '150', MIN_ERROR, 'answerMinInvalid'],
    ['min above 600', '601', '650', MIN_ERROR, 'answerMinInvalid'],
    ['min not an integer', '90.5', '150', MIN_ERROR, 'answerMinInvalid'],
    ['min empty', '', '150', MIN_ERROR, 'answerMinInvalid'],
    ['max above 600', '90', '601', MAX_ERROR, 'answerMaxInvalid'],
    ['max below 10', '5', '9', MAX_ERROR, 'answerMaxInvalid'],
    ['max not an integer', '90', '150.5', MAX_ERROR, 'answerMaxInvalid'],
    ['min equal to max', '120', '120', MAX_ERROR, 'answerMaxNotAboveMin'],
    ['min above max', '200', '100', MAX_ERROR, 'answerMaxNotAboveMin'],
  ])('blocks %s', async (_label, min, max, errorSelector, code) => {
    const wrapper = mountForm()

    await wrapper.get(MIN).setValue(min)
    await wrapper.get(MAX).setValue(max)

    expect(await submitted(wrapper)).toBeUndefined()
    const error = wrapper.get(errorSelector)
    expect(error.text()).toContain(`avatar_templates.form.errors.${code}`)
  })

  it('accepts the boundaries 10 and 600', async () => {
    const wrapper = mountForm()

    await wrapper.get(MIN).setValue('10')
    await wrapper.get(MAX).setValue('600')

    expect(await submitted(wrapper)).toMatchObject({
      answer_min_seconds: 10,
      answer_max_seconds: 600,
    })
  })
})

describe('a server refusal', () => {
  const refusal = (field: string) =>
    Object.assign(new Error('422'), {
      status: 422,
      data: { errors: { [field]: ['The answer max seconds must be greater than min.'] } },
    })

  it('on answer_max_seconds shows the i18n copy next to the input and keeps the value', () => {
    const wrapper = mountForm(
      { id: 4, answer_min_seconds: 60, answer_max_seconds: 200 },
      refusal('answer_max_seconds')
    )

    const error = wrapper.get(MAX_ERROR)
    expect(error.text()).toContain('avatar_templates.form.errors.answerMaxNotAboveMin')
    expect(wrapper.text()).not.toContain('must be greater than min')
    expect(wrapper.get(MAX).attributes('aria-invalid')).toBe('true')
    expect(wrapper.get(MAX).attributes('aria-describedby')).toContain(error.attributes('id'))
    expect(value(wrapper, MAX)).toBe('200')
    expect(wrapper.find('[data-testid="template-form-errors"]').exists()).toBe(false)
  })

  it('on answer_min_seconds shows the i18n copy next to the min input', () => {
    const wrapper = mountForm({ id: 4 }, refusal('answer_min_seconds'))

    expect(wrapper.get(MIN_ERROR).text()).toContain('avatar_templates.form.errors.answerMinInvalid')
    expect(wrapper.find('[data-testid="template-form-errors"]').exists()).toBe(false)
  })
})

describe('copy', () => {
  const keys = [
    ['form', 'answer_min_seconds'],
    ['form', 'answer_min_seconds_hint'],
    ['form', 'answer_max_seconds'],
    ['form', 'answer_max_seconds_hint'],
    ['form', 'errors', 'answerMinInvalid'],
    ['form', 'errors', 'answerMaxInvalid'],
    ['form', 'errors', 'answerMaxNotAboveMin'],
  ]

  const lookup = (table: unknown, path: string[]): unknown =>
    path.reduce<unknown>(
      (node, part) => (node as Record<string, unknown> | undefined)?.[part],
      (table as { avatar_templates: unknown }).avatar_templates
    )

  it.each(keys.map((path) => [path.join('.'), path] as const))(
    'has an it and an en entry for %s',
    (_label, path) => {
      for (const table of [en, it_]) {
        expect(typeof lookup(table, path)).toBe('string')
      }
    }
  )
})
