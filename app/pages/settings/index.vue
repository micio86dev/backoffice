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
    <Tabs v-else default-value="organization" orientation="vertical" class="items-start gap-8">
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
            `organization` is null until the first fetch resolves; the two
            panels that take it as a prop must not mount before then, while
            the two that fetch their own data must not wait for it.
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
import { ref, computed, onMounted, defineAsyncComponent } from 'vue'
import {
  BuildingOffice2Icon,
  KeyIcon,
  BoltIcon,
  UserGroupIcon,
  CpuChipIcon,
  SwatchIcon,
} from '@heroicons/vue/24/outline'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useOrganization, type OrganizationResponse } from '@/composables/useOrganization'
import { useCurrentUser } from '@/composables/useCurrentUser'
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

// The rail and the panel headers read from the same source, so a section can
// never show one label in the nav and another above its content.
const SECTIONS = [
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
] as const

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

// Each section names the ABILITY it needs, and `can()` answers from the map
// the server resolves through its own policies — never from `roles.includes
// ('admin')`, which is a second copy of an authorization rule that drifts the
// moment the policy changes.
//
// `can()` fails closed, so a transient `/auth/me` error hides sections rather
// than offering ones whose every request would come back 403. Affordance only:
// the endpoints behind each section authorize independently.
const { can } = useCurrentUser()

// EVERY section names an ability — none is unconditional. A section with no
// gate stays on screen when `/auth/me` fails, which is the one moment the page
// knows least about who is looking at it.
const visibleSections = computed(() => SECTIONS.filter((section) => can(section.requires)))

const loadErrorTitleKey = computed(() => resourceErrorKey(loadError.value ?? 'error', 'title'))
const loadErrorMessageKey = computed(() => resourceErrorKey(loadError.value ?? 'error', 'message'))

async function load(): Promise<void> {
  try {
    const response = await fetchOrganization()
    organization.value = response.data
    loadError.value = null
  } catch (error) {
    loadError.value = resolveResourceErrorState(error)
  }
}

async function onSaved(): Promise<void> {
  await load()
}

onMounted(() => {
  void load()
  // Fills the shared identity cache `can()` reads. Swallowed on failure for
  // the same reason it always was: `can()` already answers false without it,
  // so a failed identity narrows the page rather than breaking it.
  void useCurrentUser()
    .ensureLoaded()
    .catch(() => undefined)
})
</script>
