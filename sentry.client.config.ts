import * as Sentry from '@sentry/nuxt'
import { sentryPosture, shouldInitSentry } from './app/utils/sentry-init'
import {
  scrubBreadcrumb,
  scrubSentryEvent,
  type ScrubbableBreadcrumb,
  type ScrubbableEvent,
} from './app/utils/sentry-scrub'

/**
 * Sentry — client-side (C13, task 5.1, Nuxt half, backoffice).
 *
 * `@sentry/nuxt/module` loads this file automatically as a client plugin; it
 * runs inside a `defineNuxtPlugin` wrapper the module supplies, which is why
 * `useRuntimeConfig()` is available here even though this is not itself a
 * `~/plugins/*.client.ts` file.
 *
 * Every decision about WHAT may be sent lives in `app/utils/sentry-init.ts`
 * and `app/utils/sentry-scrub.ts`, both unit-tested in isolation. This file
 * is wiring only — the same split this codebase already uses for
 * GA4 (`app/utils/analytics.ts` decides, `app/plugins/analytics.client.ts`
 * injects).
 *
 * Consent: Sentry is NOT gated on `beai.consent.analytics`, unlike GA4.
 * Error monitoring and behavioral/marketing analytics are different
 * things — the spec's own Tool Responsibility Boundaries table treats them
 * as separate tools with separate purposes, and this codebase's api
 * integration (`api/config/sentry.php`) is not consent-gated either. Gating
 * crash reporting on a cookie-banner answer would blind the team to
 * dashboard failures for every operator who has not opted into analytics —
 * in exchange for a privacy benefit the scrubber below already provides
 * without it: no candidate-identifying or candidate-authored content, no
 * entry-link URL, and no persistent user identifier ever reaches Sentry.
 *
 * Session Replay is deliberately NOT enabled. This app runs no DOM-recording
 * tool at all: Microsoft Clarity was removed from the backoffice entirely
 * (`app/plugins/analytics.client.ts`, openspec/specs/observability/spec.md's
 * Microsoft Clarity — User Behavior Analytics requirement) because it is an
 * internal admin tool rendering a candidate's transcript and BARS scores —
 * exactly the screens a second DOM recorder here would also record.
 */

const config = useRuntimeConfig()
const dsn = String(config.public.sentryDsn ?? '')

const posture = sentryPosture(dsn, String(config.public.sentryEnvironment ?? ''))

// NOT initialised at all without a DSN, rather than initialised-and-disabled.
// `enabled: false` was assumed to make the SDK inert and does not: verified in
// a browser, the page still gets a populated `window.__SENTRY__` carrier, and
// the SDK brings its vendored web-vitals with it — the source of the recurring
// `reportAllChanges` TypeError in the console of an app that observes no web
// vitals of its own. See shouldInitSentry().
if (shouldInitSentry(dsn)) {
  Sentry.init({
    ...posture,
    // Props are attached under `contexts.nuxt.propsData` by @sentry/nuxt's
    // `reportNuxtError`, and `attachProps` defaults to TRUE. NOT by
    // @sentry/vue's error handler, which this comment used to name: the Nuxt
    // module installs its client plugin with `attachErrorHandler: false`, so
    // that path never runs here. The guard is load-bearing either way —
    // `reportNuxtError` reads the same top-level `attachProps` — but a comment
    // naming the wrong mechanism is a trap for whoever refactors next. Every
    // `<Input v-model>` in this app therefore surfaces its typed value under the
    // key `modelValue` — which is not a denied key and ends in none of
    // `_token`/`_secret`/`_key`, so a plaintext password from `login.vue` or
    // `ProfilePasswordForm.vue` reached Sentry verbatim. A denylist keyed on
    // FIELD names cannot see a value that arrives under a FRAMEWORK's name, so
    // the fix belongs here rather than in the denylist.
    attachProps: false,
    beforeSend: (event) =>
      scrubSentryEvent(event as unknown as ScrubbableEvent) as unknown as typeof event,
    beforeBreadcrumb: (breadcrumb) =>
      scrubBreadcrumb(
        breadcrumb as unknown as ScrubbableBreadcrumb
      ) as unknown as typeof breadcrumb,
  })
}
