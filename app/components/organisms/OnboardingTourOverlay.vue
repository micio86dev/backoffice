<template>
  <Teleport to="body">
    <!--
      Deliberately NOT a modal. HelpSheet.vue's own docblock already rejected
      a covering dialog for exactly this reason: "A modal tour would cover
      the thing it is describing." This panel sits BESIDE the highlighted nav
      item, with no dimming backdrop, so the sidebar stays fully visible and
      operable while the tour is open — a keyboard or pointer user can still
      follow the highlighted link directly instead of being forced through
      Next/Skip.

      `role="dialog"` with `tabindex="-1"` and a manually-focused, keyboard-
      dismissible panel IS the accessible pattern here — the rule below fires
      because `dialog` is not in its interactive-role list, the same
      plugin limitation ImageCropDialog.vue documents for `role="application"`.
    -->
    <!-- eslint-disable-next-line vuejs-accessibility/no-static-element-interactions -->
    <div
      v-if="isOpen && currentStep"
      ref="panelEl"
      role="dialog"
      :aria-label="$t('onboardingTour.regionLabel')"
      tabindex="-1"
      data-testid="onboarding-tour"
      class="ring-foreground/10 bg-popover text-popover-foreground fixed z-50 flex w-full max-w-xs flex-col gap-3 rounded-xl p-4 text-sm shadow-lg ring-1 outline-none"
      :style="panelStyle"
      @keydown.esc="onSkip"
    >
      <div class="flex items-center gap-2">
        <component
          :is="stepIcon"
          v-if="stepIcon"
          aria-hidden="true"
          class="text-primary size-5 shrink-0"
        />
        <h2 class="text-foreground font-semibold">{{ $t(stepTitleKey) }}</h2>
      </div>

      <p class="text-muted-foreground">{{ $t(stepDescriptionKey) }}</p>

      <p class="text-muted-foreground text-xs" data-testid="onboarding-tour-progress">
        {{ $t('onboardingTour.progress', { current: currentIndex + 1, total: steps.length }) }}
      </p>

      <div class="mt-1 flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          data-testid="onboarding-tour-skip"
          @click="onSkip"
        >
          {{ $t('onboardingTour.skip') }}
        </Button>

        <div class="flex gap-2">
          <Button
            v-if="currentIndex > 0"
            type="button"
            variant="outline"
            size="sm"
            data-testid="onboarding-tour-back"
            @click="back"
          >
            {{ $t('onboardingTour.back') }}
          </Button>
          <Button type="button" size="sm" data-testid="onboarding-tour-next" @click="onNext">
            {{ isLastStep ? $t('onboardingTour.finish') : $t('onboardingTour.next') }}
          </Button>
        </div>
      </div>
    </div>

    <!--
      Purely decorative — the panel above already names the target in text,
      so a screen reader loses nothing when this ring cannot be positioned
      (`highlightStyle === null`, e.g. the target has not painted yet).
    -->
    <div
      v-if="isOpen && highlightStyle"
      aria-hidden="true"
      data-testid="onboarding-tour-highlight"
      class="ring-primary ring-offset-background pointer-events-none fixed z-40 rounded-md ring-2 ring-offset-2 transition-[top,left,width,height] duration-150"
      :style="highlightStyle"
    />
  </Teleport>
</template>

<script setup lang="ts">
/**
 * OnboardingTourOverlay (backoffice-role-aware-onboarding-guide, T4).
 *
 * The visible half of `useOnboardingTour.ts` (T2): resolves each step's
 * on-screen target and renders the coach-mark panel + highlight ring
 * `useOnboardingTour` deliberately does not know about (PURE LOGIC ONLY, see
 * that file's docblock).
 *
 * Mounted once in `layouts/default.vue`, alongside `SidebarNav` and
 * `NavBar` rather than nested inside either — `NAV_ITEMS`' targets live in
 * the sidebar (`data-onboarding-target`) and the help step's target lives in
 * the top bar (`HelpSheet`'s `data-testid="help-trigger"`), so this organism
 * needs both as PEERS, not as an ancestor of one and a stranger to the
 * other. `document.querySelector` reaches across that boundary on purpose —
 * this is exactly the kind of real-DOM positioning concern
 * `useOnboardingTour.ts` explicitly pushed out of itself.
 *
 * Resolves `canSwitchClients`/`actingClientId` itself, the SAME shape
 * `SidebarNav.vue` resolves independently for its own filter — a second
 * `GET /admin/clients` for a superadmin only (an infrequent, low-cost path)
 * rather than threading shared state between two otherwise-independent
 * organisms for one narrow case.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { QuestionMarkCircleIcon } from '@heroicons/vue/24/outline'
import { Button } from '@/components/ui/button'
import { useOnboardingTour, type OnboardingStep } from '@/composables/useOnboardingTour'
import { useCurrentUser } from '@/composables/useCurrentUser'
import { useSuperadmin } from '@/composables/useSuperadmin'

/**
 * Reuses `help.topics.*.summary` (HelpSheet.vue) rather than authoring a
 * second description for the same page — the two panels would drift the
 * moment one was updated and not the other. `/clients` has no help topic
 * yet (HelpSheet.vue's own TOPICS map omits it), so it gets its own key.
 */
const DESCRIPTION_KEY_BY_PATH: Record<string, string> = {
  '/': 'help.topics.dashboard.summary',
  '/projects': 'help.topics.projects.summary',
  '/participants': 'help.topics.participants.summary',
  '/reports': 'help.topics.reports.summary',
  '/clients': 'onboardingTour.clients.description',
  '/avatar-templates': 'help.topics.avatarTemplates.summary',
  '/settings': 'help.topics.settings.summary',
  '/catalogue': 'help.topics.catalogue.summary',
}

function descriptionKeyFor(step: OnboardingStep): string {
  if (step.kind === 'help') return 'onboardingTour.help.description'

  // `NAV_ITEMS` (nav-items.ts) is the only source of `step.to` values, and
  // every one of its paths has an entry above — the fallback exists only so
  // TypeScript's index-signature `string | undefined` cannot smuggle an
  // `undefined` into `$t()` if that ever silently stopped being true, never
  // because a real path is expected to hit it.
  return DESCRIPTION_KEY_BY_PATH[step.to] ?? step.labelKey
}

function titleKeyFor(step: OnboardingStep): string {
  // `help.label` ("Help") — the SAME i18n key HelpSheet.vue's own trigger
  // button renders, so the tour never introduces a second name for it.
  return step.kind === 'help' ? 'help.label' : step.labelKey
}

function targetSelectorFor(step: OnboardingStep): string {
  return step.kind === 'help'
    ? '[data-testid="help-trigger"]'
    : `[data-onboarding-target="${step.to}"]`
}

const canSwitchClients = ref(false)
const actingClientId = ref<number | null>(null)

// `shallowRef`, not `ref`: `ref()` would deep-`reactive()`-convert the
// returned object, and Vue auto-unwraps a Ref accessed as a property of a
// reactive object — every `tour.value.steps.value` below would then read
// `.value` on an already-unwrapped array. `shallowRef` keeps `tour.value`
// the plain object `useOnboardingTour()` returned, so its own `steps`/
// `currentStep`/etc. stay the actual refs they are.
//
// Created immediately with the safe default (an ordinary operator's own
// case, per useOnboardingTour.ts's own docblock) so the tour can open with
// zero delay for the overwhelming majority of sign-ins; recreated below only
// for a superadmin, once their acting-client selection is actually known.
const tour = shallowRef(useOnboardingTour())

const steps = computed(() => tour.value.steps.value)
const currentIndex = computed(() => tour.value.currentIndex.value)
const currentStep = computed(() => tour.value.currentStep.value)
const isLastStep = computed(() => currentIndex.value === steps.value.length - 1)

const stepTitleKey = computed(() => (currentStep.value ? titleKeyFor(currentStep.value) : ''))
const stepDescriptionKey = computed(() =>
  currentStep.value ? descriptionKeyFor(currentStep.value) : ''
)
const stepIcon = computed(() => {
  const step = currentStep.value
  // `!step`, not `=== null`: `currentStep` is `steps.value[currentIndex.value]`,
  // which TypeScript (correctly) types as possibly `undefined`, never `null`.
  if (!step) return null
  return step.kind === 'help' ? QuestionMarkCircleIcon : step.icon
})

const isOpen = ref(false)
const panelEl = ref<HTMLElement | null>(null)
const highlightStyle = ref<Record<string, string> | null>(null)
const panelStyle = ref<Record<string, string>>({ top: '0px', left: '0px' })

const GAP = 12
const PANEL_WIDTH = 320

/**
 * Positions the highlight ring on the current step's real element, and the
 * panel just outside it (to the right when there is room, otherwise to the
 * left) — never on top of it, which is the whole point of a ring that is
 * supposed to point at something.
 *
 * A missing target (the element has not painted yet, e.g. a superadmin's
 * client-scoped items appearing after the async resolution above) leaves
 * `highlightStyle` null — the ring is decorative and skipped — but still
 * positions the panel at a sane fallback (viewport centre-left) so the tour
 * never renders with no panel at all.
 */
function updatePosition(): void {
  const step = currentStep.value
  // `!step`, not `=== null`: `tour.value.currentStep.value` is
  // `steps.value[currentIndex.value]`, which is `undefined` — never
  // `null` — once the tour has closed and this fires as a stale retry.
  if (!step) {
    highlightStyle.value = null
    return
  }

  const target = document.querySelector(targetSelectorFor(step))

  if (target === null) {
    highlightStyle.value = null
    panelStyle.value = { top: '96px', left: '96px' }
    return
  }

  const rect = target.getBoundingClientRect()
  const pad = 6

  highlightStyle.value = {
    top: `${rect.top - pad}px`,
    left: `${rect.left - pad}px`,
    width: `${rect.width + pad * 2}px`,
    height: `${rect.height + pad * 2}px`,
  }

  const fitsOnRight = rect.right + GAP + PANEL_WIDTH <= window.innerWidth
  const left = fitsOnRight ? rect.right + GAP : Math.max(GAP, rect.left - GAP - PANEL_WIDTH)
  const top = Math.min(Math.max(rect.top, GAP), window.innerHeight - GAP - 40)

  panelStyle.value = { top: `${top}px`, left: `${left}px` }
}

function reposition(): void {
  void nextTick().then(updatePosition)
}

let retryTimer: ReturnType<typeof setTimeout> | undefined

watch(currentStep, () => {
  reposition()
  clearTimeout(retryTimer)
  // One retry: the target this step now points at may not have painted yet
  // (the superadmin scope resolution above, or a route-driven re-render of
  // the sidebar's own filtered list) — a single delayed pass is enough for
  // any ordinary async settle without turning this into a polling loop.
  // Cleared on unmount below — an uncleared timer firing after teardown is
  // exactly what surfaced the `!step` guard's own bug above.
  retryTimer = setTimeout(updatePosition, 300)
})

function onWindowChange(): void {
  if (isOpen.value) updatePosition()
}

function openTour(): void {
  isOpen.value = true
  reposition()
  nextTick(() => panelEl.value?.focus())
}

function closeTour(): void {
  isOpen.value = false
  highlightStyle.value = null
}

function onNext(): void {
  if (isLastStep.value) {
    tour.value.finish()
    closeTour()
    return
  }
  tour.value.next()
  nextTick(() => panelEl.value?.focus())
}

function back(): void {
  tour.value.back()
  nextTick(() => panelEl.value?.focus())
}

function onSkip(): void {
  tour.value.skip()
  closeTour()
}

onMounted(async () => {
  window.addEventListener('resize', onWindowChange)
  window.addEventListener('scroll', onWindowChange, true)

  const { ensureLoaded, can } = useCurrentUser()

  let identityLoaded = false

  try {
    await ensureLoaded()
    identityLoaded = true

    if (can('clients.viewAny')) {
      canSwitchClients.value = true
      const clients = await useSuperadmin().fetchClients()
      actingClientId.value = clients.acting_organization_id ?? null
      tour.value = useOnboardingTour({
        canSwitchClients: canSwitchClients.value,
        actingClientId: actingClientId.value,
      })
    }
  } catch {
    // Same posture as SidebarNav.vue: a failed identity or client-list read
    // must not crash the shell. The tour simply falls back to the default,
    // unrestricted step list it was already created with above.
  }

  if (identityLoaded && !tour.value.hasSeenTour.value) {
    openTour()
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWindowChange)
  window.removeEventListener('scroll', onWindowChange, true)
  clearTimeout(retryTimer)
})
</script>
