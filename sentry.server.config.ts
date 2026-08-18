import * as Sentry from '@sentry/nuxt'
import { sentryPosture } from './app/utils/sentry-init'
import {
  scrubBreadcrumb,
  scrubSentryEvent,
  type ScrubbableBreadcrumb,
  type ScrubbableEvent,
} from './app/utils/sentry-scrub'

/**
 * Sentry — server-side (Nitro), C13 task 5.1, Nuxt half, backoffice.
 *
 * This app is `ssr: false` (SPA) — Nitro here only serves the prerendered
 * shell and static assets, so this side sees far less traffic than
 * `frontend`'s SSR server. It is still wired for symmetry and because a
 * failed prerender or a Nitro-level error is exactly the kind of thing
 * error monitoring exists to catch, with the same posture and the same
 * scrubber as `sentry.client.config.ts`.
 */

const config = useRuntimeConfig()
const posture = sentryPosture(
  String(config.public.sentryDsn ?? ''),
  String(config.public.sentryEnvironment ?? '')
)

Sentry.init({
  ...posture,
  beforeSend: (event) =>
    scrubSentryEvent(event as unknown as ScrubbableEvent) as unknown as typeof event,
  beforeBreadcrumb: (breadcrumb) =>
    scrubBreadcrumb(breadcrumb as unknown as ScrubbableBreadcrumb) as unknown as typeof breadcrumb,
})
