/**
 * AuditFlag.vue — RED (scoring-audit-jev P6, admin-backoffice spec "A
 * Net-New Review-Status Element Renders Per-Indicator Audit Signal —
 * ScoreChip Stays Score-Only").
 *
 * A net-new, visually and semantically distinct element from `ScoreChip`:
 * `ScoreChip` continues to encode the numeric score only, this component
 * encodes the per-indicator audit signal — `judged` / `unavailable` /
 * `malformed` / `skipped` / the serializer-only synthetic `never_audited`
 * (`AdminEvaluationSerializer::serializeAudit()`).
 *
 * `support_probability` renders VERBATIM as a percentage, with no derived
 * High/Medium/Low band (design D9 / CLAUDE.md ruling 1's precedent,
 * `ReliabilityBadge.vue`'s own doctrine applied to the second advisory
 * number the product has ever had) — the five STATUSES get distinct visual
 * treatment; the raw probability NUMBER is never bucketed.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import AuditFlag from '../../../../app/components/atoms/AuditFlag.vue'
import enMessages from '../../../../i18n/locales/en.json'
import itMessages from '../../../../i18n/locales/it.json'

const tMock = (key: string, params?: Record<string, unknown>) =>
  params ? `${key}:${JSON.stringify(params)}` : key

describe('AuditFlag — five wire statuses render with distinct visual treatment', () => {
  it('judged renders the support_probability verbatim as a percentage, no band', () => {
    const wrapper = mount(AuditFlag, {
      props: { status: 'judged', supportProbability: 0.82, outcomeReason: null },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toContain('82%')
    expect(wrapper.text()).toContain('report.audit.flag.judged')
  })

  // WCAG 2.1 AA — the percentage is rendered verbatim per D9/ruling 1
  // precisely because it is real, non-bucketed information; hiding it from
  // assistive tech is a content loss, not a decorative omission. The visible
  // glyph sits in an `aria-hidden` span (so a screen reader doesn't read a
  // bare "82%" with no context), so the sr-only label must carry it instead.
  it('the SR-ONLY label — not just the visible aria-hidden glyph — announces the support_probability for a judged verdict', () => {
    const wrapper = mount(AuditFlag, {
      props: { status: 'judged', supportProbability: 0.82, outcomeReason: null },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.find('.sr-only').text()).toContain('82%')
  })

  // Every OTHER status renders a neutral dash glyph with nothing to
  // announce beyond its own label — no bare "–" in the sr-only text.
  it('a non-judged status does not announce a bare dash in its sr-only label', () => {
    const wrapper = mount(AuditFlag, {
      props: { status: 'skipped', supportProbability: null, outcomeReason: null },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.find('.sr-only').text()).not.toContain('–')
  })

  it('a LOW support_probability renders the same way as a high one — no band, no colour-by-value', () => {
    const low = mount(AuditFlag, {
      props: { status: 'judged', supportProbability: 0.1, outcomeReason: null },
      global: { mocks: { $t: tMock } },
    })
    const high = mount(AuditFlag, {
      props: { status: 'judged', supportProbability: 0.95, outcomeReason: null },
      global: { mocks: { $t: tMock } },
    })

    // Same badge variant/component for both — only the verbatim number
    // differs (it now appears TWICE: the visible aria-hidden glyph and the
    // sr-only label — hence the global replace).
    expect(low.html().replace(/10%/g, 'X').replace(/95%/g, 'X')).toBe(
      high.html().replace(/10%/g, 'X').replace(/95%/g, 'X')
    )
  })

  it('unavailable renders its own label, distinct from judged', () => {
    const wrapper = mount(AuditFlag, {
      props: { status: 'unavailable', supportProbability: null, outcomeReason: 'judge_timeout' },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toContain('report.audit.flag.unavailable')
    expect(wrapper.text()).not.toContain('report.audit.flag.judged')
  })

  it('malformed renders its own label, distinct from unavailable', () => {
    const wrapper = mount(AuditFlag, {
      props: { status: 'malformed', supportProbability: null, outcomeReason: 'verdict_missing' },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toContain('report.audit.flag.malformed')
    expect(wrapper.text()).not.toContain('report.audit.flag.unavailable')
  })

  it('skipped renders its own label, distinct from malformed', () => {
    const wrapper = mount(AuditFlag, {
      props: {
        status: 'skipped',
        supportProbability: null,
        outcomeReason: 'unassessable_by_construction',
      },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toContain('report.audit.flag.skipped')
    expect(wrapper.text()).not.toContain('report.audit.flag.malformed')
  })

  it('never_audited renders as "not audited" — never as "no issues" — distinct from skipped', () => {
    const wrapper = mount(AuditFlag, {
      props: { status: 'never_audited', supportProbability: null, outcomeReason: null },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toContain('report.audit.flag.neverAudited')
    expect(wrapper.text()).not.toContain('report.audit.flag.skipped')
    expect(wrapper.text()).not.toContain('no issues')
    expect(wrapper.text()).not.toContain('report.audit.flag.noIssues')
  })

  it('all five statuses produce five DIFFERENT badge variants (distinct visual treatment)', () => {
    const statuses = ['judged', 'unavailable', 'malformed', 'skipped', 'never_audited'] as const
    const variants = statuses.map((status) => {
      const wrapper = mount(AuditFlag, {
        props: {
          status,
          supportProbability: status === 'judged' ? 0.5 : null,
          outcomeReason: null,
        },
        global: { mocks: { $t: tMock } },
      })
      return wrapper.find('[data-slot="badge"]').attributes('data-variant')
    })

    expect(new Set(variants).size).toBe(5)
  })

  // WCAG 2.1 AA 1.4.1 — meaning must never be conveyed by colour alone.
  // `unavailable`/`malformed`/`skipped`/`never_audited` all render the same
  // "–" glyph text (no support_probability to show) and would otherwise be
  // distinguishable ONLY by the Badge's colour variant — exactly the failure
  // ScoreChip's own docblock already refuses for score rendering. Each
  // status renders its OWN icon, a non-colour cue.
  it('each of the five statuses renders a distinct VISIBLE icon — not colour-only', () => {
    const statuses = ['judged', 'unavailable', 'malformed', 'skipped', 'never_audited'] as const
    const svgPaths = statuses.map((status) => {
      const wrapper = mount(AuditFlag, {
        props: {
          status,
          supportProbability: status === 'judged' ? 0.5 : null,
          outcomeReason: null,
        },
        global: { mocks: { $t: tMock } },
      })
      const svg = wrapper.find('svg[aria-hidden="true"]')
      expect(svg.exists(), `${status} renders no icon`).toBe(true)
      return svg.html()
    })

    expect(new Set(svgPaths).size).toBe(5)
  })
})

// `status` is typed `string` by the generated OpenAPI schema (the closed
// five-value vocabulary is enforced at the database CHECK and the
// serializer, not expressible in the generated type) — a genuinely
// unrecognised value must fall back loudly, never silently render as
// `never_audited` (which asserts something specific: "this indicator was
// never audited", not "we don't know what this status means").
describe('AuditFlag — an unrecognised status falls back loudly, never as never_audited', () => {
  it('renders its own unknown-status copy, distinct from never_audited', () => {
    const wrapper = mount(AuditFlag, {
      props: { status: 'a_future_status', supportProbability: null, outcomeReason: null },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toContain('report.audit.flag.unknown')
    expect(wrapper.text()).not.toContain('report.audit.flag.neverAudited')
  })
})

describe('AuditFlag — reason surfaces for a degraded status', () => {
  it('renders a reason-specific label for a known unavailable reason', () => {
    const wrapper = mount(AuditFlag, {
      props: { status: 'unavailable', supportProbability: null, outcomeReason: 'judge_timeout' },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toContain('report.audit.reason.judge_timeout')
  })

  it('falls back to the unknown-reason key for an unrecognised reason, never the raw string', () => {
    const wrapper = mount(AuditFlag, {
      props: { status: 'malformed', supportProbability: null, outcomeReason: 'a_future_reason' },
      global: { mocks: { $t: tMock } },
    })

    expect(wrapper.text()).toContain('report.audit.reason.unknown')
    expect(wrapper.text()).not.toContain('a_future_reason')
  })

  // The two tests above mock `$t` as the identity on the KEY, so they never
  // exercise the actual locale COPY behind `report.audit.reason.unknown` —
  // a bug where that copy itself renders literally to real users would pass
  // both of them regardless of what the copy actually says. This test
  // mounts with the REAL vue-i18n plugin and the REAL locale files instead,
  // so it renders what an operator actually sees, in both mandatory
  // locales. Component calls `$t(reasonKey)` with NO named params, so a
  // `{reason}` interpolation in the message resolves to an EMPTY string
  // (vue-i18n's behaviour for a missing named param, not the literal
  // placeholder text) — the observable defect is a dangling empty
  // parenthetical, e.g. "...unrecognised reason ().", not literal braces.
  it('the REAL rendered copy for an unrecognised reason reads as sensible copy — no literal {reason} and no dangling empty parenthesis — in en and it', () => {
    for (const [locale, messages] of [
      ['en', enMessages],
      ['it', itMessages],
    ] as const) {
      const i18n = createI18n({
        legacy: true,
        locale,
        fallbackLocale: false,
        missingWarn: false,
        fallbackWarn: false,
        messages: { [locale]: messages },
      })

      const wrapper = mount(AuditFlag, {
        props: { status: 'malformed', supportProbability: null, outcomeReason: 'a_future_reason' },
        global: { plugins: [i18n] },
      })

      const srText = wrapper.find('.sr-only').text()
      expect(srText, `locale=${locale}`).not.toContain('{reason}')
      // The dangling-empty-parenthesis defect: an unresolved `{reason}`
      // named interpolation collapses to an empty string, leaving "()"
      // in the rendered sentence.
      expect(srText, `locale=${locale}`).not.toMatch(/\(\s*\)/)
      expect(srText.trim().length, `locale=${locale}`).toBeGreaterThan(0)
    }
  })
})
