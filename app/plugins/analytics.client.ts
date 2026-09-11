import { analyticsPlan, createGtagStub, gaConfigPayload } from '~/utils/analytics'
import { ANALYTICS_CONSENT_EVENT, readAnalyticsConsent } from '~/utils/analytics-consent'
import { redactAnalyticsPath } from '~/utils/analytics-path'

/**
 * Loads GA4 — if, and only if, it is allowed to run (C13, tasks 5.3 / 5.4).
 *
 * `.client` because it is a browser SDK, and because an SSR render has no
 * consent to read: server-side loading would track everyone unconditionally.
 *
 * The plugin itself holds no policy. Every decision about what may load and
 * what may be sent lives in the pure functions it calls, so those decisions can
 * be asserted in unit tests instead of inferred from control flow. What is left
 * here is script injection and route subscription.
 *
 * Microsoft Clarity used to be loaded here too. It was removed from this app
 * (openspec/specs/observability/spec.md, Microsoft Clarity — User Behavior
 * Analytics): the backoffice is an internal admin tool that renders a
 * candidate's transcript and BARS scores, and a third-party session recorder
 * there is a privacy liability the frontend does not share. Clarity remains
 * frontend-only.
 */

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}

function injectScript(src: string, id: string): void {
  if (document.getElementById(id) !== null) {
    return
  }

  const script = document.createElement('script')
  script.id = id
  script.async = true
  script.src = src
  document.head.appendChild(script)
}

function startGa(measurementId: string, pagePath: string): void {
  injectScript(`https://www.googletagmanager.com/gtag/js?id=${measurementId}`, 'beai-ga4')

  window.dataLayer = window.dataLayer ?? []
  window.gtag = createGtagStub(window)

  window.gtag('js', new Date())

  // Consent Mode v2, denied by default for everything this product does not
  // need. The plugin only runs at all once analytics consent is granted, so
  // `analytics_storage` is the one signal that flips — the advertising ones
  // stay denied permanently, because an operator reviewing assessments is not
  // an advertising audience under any consent they could give here.
  window.gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'granted',
  })

  window.gtag('config', measurementId, gaConfigPayload(pagePath))
}

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()
  const router = useRouter()

  const gaMeasurementId = String(config.public.gaMeasurementId ?? '')

  // Mutable, because consent can be granted mid-visit through the banner. It is
  // never revoked here: withdrawing consent has to unload third-party scripts
  // that are already running, which no SDK reliably supports, so that path is a
  // reload. Flipping this to false without a reload would LOOK like it worked.
  let consentGranted = readAnalyticsConsent(
    typeof window === 'undefined' ? undefined : window.localStorage
  )

  // `injectScript` guards on the element id, so the SCRIPT loads once — and
  // that guard reads as if it protected the whole of `startGa`. It protects one
  // line of it. Without this flag a second consent grant re-runs `gtag('js')`,
  // re-pushes the Consent Mode defaults and re-issues `config` against an
  // already-initialised container. `startFor` is called on plugin init AND from
  // the consent listener below, so the second call is a normal path, not an
  // edge case.
  let gaStarted = false

  function startFor(path: string): void {
    const plan = analyticsPlan({ gaMeasurementId, consentGranted, path })

    if (plan.loadGa && !gaStarted) {
      gaStarted = true
      startGa(gaMeasurementId, plan.pagePath)
    }
  }

  startFor(router.currentRoute.value.fullPath)

  // The banner announces a grant rather than calling in here, so this plugin
  // stays the single owner of script injection. Without it, consenting would do
  // nothing visible until the next page load — which reads as a broken button,
  // and is the sort of thing that gets "fixed" by making the banner reload the
  // page over the operator's work.
  window.addEventListener(ANALYTICS_CONSENT_EVENT, () => {
    consentGranted = true
    startFor(router.currentRoute.value.fullPath)
  })

  // Per-navigation page views, sent explicitly because gaConfigPayload turns
  // GA4's automatic ones off — those fire before the redaction can be applied
  // and would ship the raw URL exactly once per session, which is all it takes.
  router.afterEach((to) => {
    if (window.gtag === undefined) {
      return
    }

    window.gtag('event', 'page_view', {
      page_path: redactAnalyticsPath(to.fullPath),
      page_location: '',
    })
  })
})
