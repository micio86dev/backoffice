<template>
  <div class="flex flex-col gap-8">
    <PageHeader :title="$t('settings.title')" :subtitle="$t('settings.subtitle')" />

    <Alert
      v-if="loadError"
      :variant="loadError === 'not-ready' ? 'default' : 'destructive'"
      :data-state="loadError"
      data-testid="settings-error"
    >
      <AlertTitle>{{ $t(loadErrorTitleKey) }}</AlertTitle>
      <AlertDescription>{{ $t(loadErrorMessageKey) }}</AlertDescription>
    </Alert>

    <!--
      Vertical section rail, not a horizontal tab strip. These sections are
      distinct destinations with different shapes (form, table + dialog, form,
      table, table + drawer), not peer views of one dataset, and the labels run
      11-33 characters in Italian — a horizontal strip reflowed unpredictably
      and carried no information scent. A rail also absorbs a fifth entry
      without reflowing, which is why the LLM-credentials section could be
      added here at all. `orientation="vertical"` keeps the reka-ui tab
      semantics (`role="tab"` / `role="tabpanel"` / arrow-key roving focus)
      and keeps lazy panel mounting: still no `force-mount`, so only the
      section the operator is looking at is ever in the DOM (D10).
    -->
    <!--
      NOT `v-else` on the alert above, and that is the whole fix.

      The organization is ONE section's data, not the page's. A superadmin
      belongs to no organization — `users.organization_id` is null, which is
      what makes them one — so `/api/organization` answers 404 on every load,
      and hiding the entire rail behind that told them "this resource was not
      found" on a page whose PLATFORM section is built for exactly them and
      needs no organization at all. Four of the seven sections fetch their own
      data; only the three that take `organization` as a prop can be affected
      by its absence, and `visibleSections` drops precisely those.
    -->
    <Tabs v-model="activeSection" orientation="vertical" class="items-start gap-8">
      <TabsList
        class="sticky top-6 w-64 shrink-0 items-stretch gap-1 rounded-none bg-transparent p-0"
      >
        <TabsTrigger
          v-for="section in visibleSections"
          :key="section.value"
          :value="section.value"
          class="h-auto w-full flex-none items-start justify-start gap-3 whitespace-normal rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-card data-active:bg-primary/10 [&_svg]:mt-0.5 data-active:[&_svg]:text-primary [&_[data-part=label]]:text-foreground data-active:[&_[data-part=label]]:text-primary"
        >
          <component :is="section.icon" aria-hidden="true" />
          <span class="flex min-w-0 flex-col gap-0.5">
            <span data-part="label" class="text-sm leading-5 font-medium">
              {{ $t(section.labelKey) }}
            </span>
            <span class="text-xs leading-4 text-muted-foreground">
              {{ $t(section.descriptionKey) }}
            </span>
          </span>
        </TabsTrigger>
      </TabsList>

      <div class="min-w-0 flex-1">
        <TabsContent
          v-for="section in visibleSections"
          :key="section.value"
          :value="section.value"
          class="flex flex-col gap-5"
        >
          <div class="flex max-w-[65ch] flex-col gap-1">
            <h2 class="text-lg font-semibold text-foreground">{{ $t(section.labelKey) }}</h2>
            <p class="text-sm text-muted-foreground">{{ $t(section.descriptionKey) }}</p>
          </div>
          <Separator />
          <!--
            `organization` is null until the first fetch resolves; the THREE
            panels that take it as a prop must not mount before then, while
            the FOUR that fetch their own data must not wait for it.
          -->
          <component
            :is="section.component"
            v-if="!section.needsOrganization || organization"
            v-bind="section.needsOrganization ? { organization } : {}"
            @saved="onSaved"
          />
        </TabsContent>
      </div>
    </Tabs>
  </div>
</template>

<script setup lang="ts">
import PageHeader from '@/components/molecules/PageHeader.vue'
import { ref, computed, watch, onMounted, defineAsyncComponent, type Component } from 'vue'
import {
  BuildingOffice2Icon,
  KeyIcon,
  BoltIcon,
  UserGroupIcon,
  CpuChipIcon,
  SwatchIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/vue/24/outline'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useOrganization, type OrganizationResponse } from '@/composables/useOrganization'
import { useCurrentUser, type AbilityKey } from '@/composables/useCurrentUser'
import {
  resolveResourceErrorState,
  resourceErrorKey,
  type ResourceErrorState,
} from '@/utils/error-state'

const OrganizationProfileForm = defineAsyncComponent(
  () => import('@/components/organisms/OrganizationProfileForm.vue')
)
const WebhookDefaultsForm = defineAsyncComponent(
  () => import('@/components/organisms/WebhookDefaultsForm.vue')
)
const ApiKeysPanel = defineAsyncComponent(() => import('@/components/organisms/ApiKeysPanel.vue'))
const UsersPanel = defineAsyncComponent(() => import('@/components/organisms/UsersPanel.vue'))
const LlmCredentialsPanel = defineAsyncComponent(
  () => import('@/components/organisms/LlmCredentialsPanel.vue')
)
const BrandingForm = defineAsyncComponent(() => import('@/components/organisms/BrandingForm.vue'))
const PlatformSettingsPanel = defineAsyncComponent(
  () => import('@/components/organisms/PlatformSettingsPanel.vue')
)

/**
 * One settings section.
 *
 * Typed rather than inferred from `as const`, because the filter below has to
 * read `superadminOnly` on EVERY entry — and on an inferred literal tuple the
 * property exists only on the one entry that declares it, which is how the
 * filter came to branch on `requires === null` instead.
 */
interface SettingsSection {
  value: string
  labelKey: string
  descriptionKey: string
  icon: Component
  component: Component
  needsOrganization: boolean
  /** The ability this section needs, or null when identity decides instead. */
  requires: AbilityKey | null
  /** Platform-owned: gated on `is_superadmin`, never on an org-scoped policy. */
  superadminOnly?: boolean
}

// The rail and the panel headers read from the same source, so a section can
// never show one label in the nav and another above its content.
const SECTIONS: readonly SettingsSection[] = [
  {
    value: 'organization',
    labelKey: 'settings.tabs.organization',
    descriptionKey: 'settings.sectionDescription.organization',
    icon: BuildingOffice2Icon,
    component: OrganizationProfileForm,
    needsOrganization: true,
    requires: 'organization.view',
  },
  {
    // Admin-only. What every candidate of an organization sees is not an
    // operator-level decision, and the API enforces the same boundary — the
    // rail hiding it is a courtesy, never the control.
    value: 'branding',
    labelKey: 'settings.tabs.branding',
    descriptionKey: 'settings.sectionDescription.branding',
    icon: SwatchIcon,
    component: BrandingForm,
    needsOrganization: true,
    requires: 'organization.update',
  },
  {
    value: 'apiKeys',
    labelKey: 'settings.tabs.apiKeys',
    descriptionKey: 'settings.sectionDescription.apiKeys',
    icon: KeyIcon,
    component: ApiKeysPanel,
    needsOrganization: false,
    requires: 'apiClients.viewAny',
  },
  {
    value: 'webhooks',
    labelKey: 'settings.tabs.webhooks',
    descriptionKey: 'settings.sectionDescription.webhooks',
    icon: BoltIcon,
    component: WebhookDefaultsForm,
    needsOrganization: true,
    requires: 'organization.update',
  },
  {
    value: 'users',
    labelKey: 'settings.tabs.users',
    descriptionKey: 'settings.sectionDescription.users',
    icon: UserGroupIcon,
    component: UsersPanel,
    needsOrganization: false,
    requires: 'users.viewAny',
  },
  {
    value: 'llmCredentials',
    labelKey: 'settings.tabs.llmCredentials',
    descriptionKey: 'settings.sectionDescription.llmCredentials',
    icon: CpuChipIcon,
    component: LlmCredentialsPanel,
    needsOrganization: false,
    // What this manages is a decryptable vendor API key, so it is the last
    // section anyone should be shown speculatively.
    requires: 'llmCredentials.viewAny',
  },
  {
    // PLATFORM, not tenant. The only section gated on identity rather than on
    // an ability, because it is not an ability question: these rows belong to
    // BEAI and the superadmin — who belongs to no organization — is the only
    // one who may write them. `superadminOnly` is what the filter reads;
    // `requires: null` records that there is no ability to name.
    value: 'platform',
    labelKey: 'settings.tabs.platform',
    descriptionKey: 'settings.sectionDescription.platform',
    icon: AdjustmentsHorizontalIcon,
    component: PlatformSettingsPanel,
    needsOrganization: false,
    requires: null,
    superadminOnly: true,
  },
]

definePageMeta({
  name: 'settings',
})

const { t } = useI18n()

useHead({
  title: () => t('head.title.settings'),
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const { fetchOrganization } = useOrganization()

const organization = ref<OrganizationResponse['data'] | null>(null)
const loadError = ref<ResourceErrorState | null>(null)

/**
 * A superadmin with no client selected has NO organization to load, and that
 * is not a failure.
 *
 * `users.organization_id` being null is what makes them a superadmin, so
 * `/api/organization` answers 404 on every load. Rendering that as a
 * destructive "this resource could not be found" tells them something is
 * broken on a page where nothing is: the same complaint as the collapsed rail,
 * just moved into the banner. `NavBar.vue` already applies this exact guard to
 * this exact request — it was simply never applied here.
 *
 * A superadmin ACTING AS a client is the opposite case and must not be caught
 * by it: `TenantContext` scopes them to that organization, the route answers
 * 200, and they get the full settings page for the client they selected. So
 * this is resolved from the RESPONSE, not from identity alone — a 404 for a
 * superadmin is structural, and every other outcome means what it always did.
 */
const noOrganizationInContext = ref(false)

// Each section names the ABILITY it needs, and `can()` answers from the map
// the server resolves through its own policies — never from `roles.includes
// ('admin')`, which is a second copy of an authorization rule that drifts the
// moment the policy changes.
//
// `can()` fails closed, so a transient `/auth/me` error hides sections rather
// than offering ones whose every request would come back 403. Affordance only:
// the endpoints behind each section authorize independently.
const { can, user, ensureLoaded } = useCurrentUser()

// EVERY section is gated — none is unconditional. A section with no gate stays
// on screen when `/auth/me` fails, which is the one moment the page knows least
// about who is looking at it.
//
// Two KINDS of gate, and the distinction is not cosmetic. A tenant section
// names an ABILITY, answered by the server's own policies. The platform section
// names an IDENTITY: its rows belong to no organization, so no org-scoped
// policy can describe who may edit them, and `is_superadmin` — which `/auth/me`
// publishes as an explicit boolean for exactly this kind of question — is the
// honest gate. Both fail closed. `user` and `ensureLoaded` come from the
// destructure above — one call, since the composable's state is module-scoped
// and three calls only made it look like three sources of truth.

const visibleSections = computed(() =>
  SECTIONS.filter((section) => {
    // Gated on `loadError`, NOT on `organization === null`. The two differ
    // during the first tick: the organization is null before the fetch
    // resolves, and filtering on that would flash three sections out of the
    // rail and back in on every load. `loadError` is only set once the read
    // has actually failed.
    // TWO reasons an organization section cannot render, and they are not the
    // same thing. `loadError` is a failure worth telling the operator about;
    // `noOrganizationInContext` is the ordinary shape of a superadmin's page
    // and gets no banner at all. Both drop the section; only one is an error.
    if (section.needsOrganization && (loadError.value !== null || noOrganizationInContext.value)) {
      return false
    }

    return section.superadminOnly === true
      ? user.value?.is_superadmin === true
      : // Fails closed on BOTH halves: a section naming neither an ability nor
        // the platform identity is hidden rather than shown, so an incomplete
        // declaration cannot grant access by accident.
        section.requires !== null && can(section.requires)
  })
)

/**
 * Which section is open — a MODEL, not a default.
 *
 * `default-value` cannot do this job, and that is a framework fact rather than
 * a preference: `TabsRoot` calls
 * `useVModel(props, 'modelValue', emits, { defaultValue: props.defaultValue })`
 * (`reka-ui/dist/Tabs/TabsRoot.js:57`), so `props.defaultValue` is read ONCE at
 * setup and unwrapped into a plain value. Nothing watches it afterwards, and
 * `TabsContent` selects on strict equality against the model. A computed handed
 * to that prop is a computed nobody is listening to.
 *
 * The timing is what makes it bite. `useCurrentUser`'s identity arrives from
 * `ensureLoaded()` in `onMounted` — AFTER `<Tabs>` has run its setup — so at
 * first render `can()` fails closed on everything, `visibleSections` is EMPTY,
 * and the fallback below is what gets frozen in. Then `/auth/me` resolves, a
 * superadmin's `/api/organization` 404s, the three organization sections drop,
 * and the model still names one of them: a full rail beside an empty column.
 *
 * So the value is owned here and re-pointed whenever the section it names
 * stops existing. The guard is `!some`, not `length === 0`: the list being
 * non-empty says nothing about whether it still contains the OPEN section,
 * which is the case that was actually broken.
 */
const activeSection = ref<string>('organization')

watch(
  visibleSections,
  (sections) => {
    if (sections.length === 0) return

    if (!sections.some((section) => section.value === activeSection.value)) {
      activeSection.value = sections[0]!.value
    }
  },
  { immediate: true }
)

const loadErrorTitleKey = computed(() => resourceErrorKey(loadError.value ?? 'error', 'title'))
const loadErrorMessageKey = computed(() => resourceErrorKey(loadError.value ?? 'error', 'message'))

async function load(): Promise<void> {
  try {
    const response = await fetchOrganization()
    organization.value = response.data
    loadError.value = null
    noOrganizationInContext.value = false
  } catch (error) {
    const state = resolveResourceErrorState(error)

    // Identity may still be in flight; `ensureLoaded()` is awaited in
    // `onMounted` before this runs, so `user.value` is settled by now.
    if (state === 'not-found' && user.value?.is_superadmin === true) {
      organization.value = null
      loadError.value = null
      noOrganizationInContext.value = true

      return
    }

    loadError.value = state
    noOrganizationInContext.value = false
  }
}

async function onSaved(): Promise<void> {
  await load()
}

onMounted(async () => {
  // Identity FIRST, then the organization — `load()` asks `user.is_superadmin`
  // whether a 404 is structural or a failure, and a null identity would answer
  // "failure" and put the banner back. Swallowed on failure for the reason it
  // always was: `can()` already answers false without it, so a failed identity
  // narrows the page rather than breaking it. A superadmin whose identity did
  // not load is then told the organization was not found, which is the honest
  // answer when the page cannot tell who is asking.
  await ensureLoaded().catch(() => undefined)
  await load()
})
</script>
