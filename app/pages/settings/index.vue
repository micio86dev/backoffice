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
    <!--
      `data-active:…font-semibold` is NOT decoration — it is the selected
      state's NON-COLOUR cue, and the rail had none.
      `AGENTS.md` states the rule outright ("Never convey meaning by colour
      alone. Every state needs a non-colour cue"), and everything else here
      that marks selection — `bg-primary/10`, the primary label, the primary
      icon — is colour.

      WEIGHT rather than a border, because DESIGN.md §8.2.1 rules side stripes
      (`border-left` accents) out as a selected-state affordance explicitly.
      That left weight as the cue that adds a second channel without
      contradicting a ratified decision; §8.2.1 now names it.

      `role="tab"` + `aria-selected` already carry this to assistive tech, so
      the gap was never an AT failure — it was a sighted reader who cannot
      distinguish the two colours.
    -->
    <Tabs v-model="activeSection" orientation="vertical" class="items-start gap-8">
      <TabsList
        class="sticky top-6 w-64 shrink-0 items-stretch gap-1 rounded-none bg-transparent p-0"
      >
        <TabsTrigger
          v-for="section in visibleSections"
          :key="section.value"
          :value="section.value"
          class="h-auto w-full flex-none items-start justify-start gap-3 whitespace-normal rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-card data-active:bg-primary/10 [&_svg]:mt-0.5 data-active:[&_svg]:text-primary [&_[data-part=label]]:text-foreground data-active:[&_[data-part=label]]:text-primary data-active:[&_[data-part=label]]:font-semibold"
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
            v-bind="sectionProps(section)"
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
 * read `requiresTenant` on EVERY entry — and on an inferred literal tuple the
 * property exists only on the one entry that declares it.
 *
 * EVERY section now names an ability, including the two platform ones. There
 * is no identity branch left: `requires` is non-nullable, so a section that
 * declares nothing does not compile rather than quietly gating on nothing.
 */
interface SettingsSection {
  value: string
  labelKey: string
  descriptionKey: string
  icon: Component
  component: Component
  needsOrganization: boolean
  /**
   * The ability this section needs. NON-NULLABLE on purpose.
   *
   * It was `AbilityKey | null`, and the null meant "identity decides instead"
   * — the escape hatch the two platform sections used to gate themselves on
   * `is_superadmin`. Removing the null removes the hatch: there is no way to
   * declare a section the server has not published an ability for.
   */
  requires: AbilityKey
  /**
   * Meaningless outside ONE tenant — dropped in the all-clients view.
   *
   * Distinct from `needsOrganization`, which asks whether the section takes
   * the organization as a PROP. A section can fetch its own data and still be
   * unable to answer anything without a client selected; API keys are exactly
   * that, and the two questions were conflated until they weren't.
   */
  requiresTenant?: boolean
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
    // `needsOrganization: false` — the panel fetches its own list and never
    // touches the prop. `requiresTenant: true` — an M2M key authenticates FOR
    // an organization (`api_clients.organization_id` is NOT NULL), so with no
    // client selected there is nothing to list and nothing to own a new key.
    // A superadmin holds `apiClients.viewAny` through `Gate::before` and was
    // therefore shown this section in the all-clients view, where the list
    // came back empty and creating a key hit the not-null constraint.
    // `ApiClientController` refuses on its own now; this keeps the rail from
    // offering a section whose every action is a refusal.
    value: 'apiKeys',
    labelKey: 'settings.tabs.apiKeys',
    descriptionKey: 'settings.sectionDescription.apiKeys',
    icon: KeyIcon,
    component: ApiKeysPanel,
    needsOrganization: false,
    requiresTenant: true,
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
    // PLATFORM, like the section below it (RATIFIED 2026-09-14). These keys
    // stopped being an organization's bring-your-own credential and became
    // BEAI's own — one set, serving every tenant.
    //
    // Gated on the published ABILITY, never on `is_superadmin`. The server is
    // where platform identity lives and `LlmCredentialPolicy` still answers
    // from that flag; what this page must not do is RE-DERIVE the decision
    // from the same input. The moment that policy grows any condition beyond
    // the flag — a maintenance lock, a platform permission — an identity gate
    // keeps rendering the section while every action inside 403s, and nothing
    // goes red.
    //
    // Deliberately NOT `requiresTenant`: unlike API keys, these rows mean the
    // same thing with no client selected, so the all-clients view is exactly
    // where a superadmin manages them.
    //
    // What this manages is still a decryptable vendor API key, which is why
    // the gate got NARROWER here rather than wider: a tenant admin who could
    // reach this yesterday cannot today.
    value: 'llmCredentials',
    labelKey: 'settings.tabs.llmCredentials',
    descriptionKey: 'settings.sectionDescription.llmCredentials',
    icon: CpuChipIcon,
    component: LlmCredentialsPanel,
    needsOrganization: false,
    requires: 'llmCredentials.viewAny',
  },
  {
    // PLATFORM, not tenant: these rows belong to BEAI and the superadmin — who
    // belongs to no organization — is the only one who may write them.
    //
    // `platformSettings.viewAny` is published for exactly this purpose. Its
    // own definition in `AppServiceProvider` says so: the gate was added
    // BECAUSE this section had to re-derive itself from `is_superadmin` "while
    // deriving the neighbouring one from an ability". The section then went on
    // reading the flag anyway. It reads the ability now.
    value: 'platform',
    labelKey: 'settings.tabs.platform',
    descriptionKey: 'settings.sectionDescription.platform',
    icon: AdjustmentsHorizontalIcon,
    component: PlatformSettingsPanel,
    needsOrganization: false,
    requires: 'platformSettings.viewAny',
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

/**
 * Which population the Users section manages (platform-user-management D6).
 *
 * Read from `noOrganizationInContext`, which is set ONLY when
 * `/api/organization` answered 404 AND the viewer is a superadmin — the exact
 * shape of "a superadmin with no client selected". It is derived from a
 * response this page already makes, so there is no fourth `fetchClients()`
 * call to keep in step with the three that exist.
 *
 * It FAILS CLOSED, and that matters more than the saved request: any other
 * outcome — a 500, a network error, an identity that never landed — leaves it
 * false and the section on the organization variant. Treating a merely FAILED
 * read as "all clients" would show BEAI's own people to someone whose request
 * simply broke.
 */
const usersVariant = computed<'organization' | 'platform'>(() =>
  noOrganizationInContext.value ? 'platform' : 'organization'
)

/**
 * The props a section is handed. Three sections take the organization; the
 * Users one takes its scope; the rest take nothing and fetch their own data.
 */
function sectionProps(section: SettingsSection): Record<string, unknown> {
  if (section.needsOrganization) {
    return { organization: organization.value }
  }

  return section.value === 'users' ? { variant: usersVariant.value } : {}
}

// Each section names the ABILITY it needs, and `can()` answers from the map
// the server resolves through its own policies — never from `roles.includes
// ('admin')`, which is a second copy of an authorization rule that drifts the
// moment the policy changes.
//
// `can()` fails closed, so a transient `/auth/me` error hides sections rather
// than offering ones whose every request would come back 403. Affordance only:
// the endpoints behind each section authorize independently.
const { can, ensureLoaded } = useCurrentUser()

// EVERY section is gated — none is unconditional. A section with no gate stays
// on screen when `/auth/me` fails, which is the one moment the page knows least
// about who is looking at it.
//
// ONE KIND of gate now: every section names an ABILITY, answered by the
// server's own policies. The two platform sections used to name an IDENTITY
// instead and read `user.is_superadmin`, and `user` was destructured here for
// that. Both now name `platformSettings.viewAny` / `llmCredentials.viewAny`,
// which the server publishes from those same policies — so the page reads the
// ANSWER rather than recomputing it from the input. `ensureLoaded` comes from
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

    // Tenant-scoped but self-fetching: no `loadError` half, deliberately. A
    // FAILED organization read says nothing about whether a client is
    // selected, and hiding this section on a transient 500 would take the keys
    // away from an ordinary admin whose unrelated request happened to break.
    // Only `noOrganizationInContext` — a 404 for a superadmin, the exact shape
    // of the all-clients view — drops it.
    if (section.requiresTenant === true && noOrganizationInContext.value) {
      return false
    }

    // ONE gate for every section, and no identity branch beside it.
    //
    // The two platform sections used to read `user.is_superadmin` directly.
    // That is the server's own input, re-derived on the client, so the two
    // could disagree the moment the server's answer grew a second condition:
    // the rail would keep rendering a section whose every action 403s, and no
    // test could catch it because nothing read the published ability.
    //
    // `can()` fails closed on a missing identity, so a failed `/auth/me`
    // narrows the page rather than opening it.
    return can(section.requires)
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

    // A 404 here is STRUCTURAL for a platform user and an error for everyone
    // else, so the branch needs to know which one is asking — and it asks the
    // ability map, not `user.is_superadmin`.
    //
    // `clients.viewAny` is the honest question: it is the ability to operate
    // the estate rather than one organization, which is exactly the identity
    // for which `/api/organization` has no row to return. `Gate::define
    // ('viewAnyClients')` answers it, so client and server agree by
    // construction instead of by two copies of the same rule.
    //
    // It fails CLOSED, and that matters more than the tidiness: `can()`
    // answers false on a failed `/auth/me`, so an unknown viewer gets the
    // error banner rather than being silently told this is normal.
    //
    // Identity may still be in flight; `ensureLoaded()` is awaited in
    // `onMounted` before this runs, so the map is settled by now.
    if (state === 'not-found' && can('clients.viewAny')) {
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
  // Identity FIRST, then the organization — `load()` asks `can('clients.viewAny')`
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
