<template>
  <div class="flex flex-col gap-8">
    <header class="flex max-w-[65ch] flex-col gap-1.5">
      <h1 class="text-2xl font-semibold tracking-tight text-foreground">
        {{ $t('settings.title') }}
      </h1>
      <p class="text-sm text-muted-foreground">{{ $t('settings.subtitle') }}</p>
    </header>

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
      Vertical section rail, not a horizontal tab strip. These four sections are
      distinct destinations with different shapes (form, table + dialog, form,
      table), not peer views of one dataset, and the labels run 11-28 characters
      in Italian — a horizontal strip reflowed unpredictably and carried no
      information scent. `orientation="vertical"` keeps the reka-ui tab
      semantics (`role="tab"` / `role="tabpanel"` / arrow-key roving focus)
      and keeps lazy panel mounting: still no `force-mount`, so only the
      section the operator is looking at is ever in the DOM (D10).
    -->
    <Tabs v-else default-value="organization" orientation="vertical" class="items-start gap-8">
      <TabsList
        class="sticky top-6 w-64 shrink-0 items-stretch gap-1 rounded-none bg-transparent p-0"
      >
        <TabsTrigger
          v-for="section in SECTIONS"
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
          v-for="section in SECTIONS"
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
import { ref, computed, onMounted, defineAsyncComponent } from 'vue'
import { BuildingOffice2Icon, KeyIcon, BoltIcon, UserGroupIcon } from '@heroicons/vue/24/outline'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useOrganization, type OrganizationResponse } from '@/composables/useOrganization'
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
  },
  {
    value: 'apiKeys',
    labelKey: 'settings.tabs.apiKeys',
    descriptionKey: 'settings.sectionDescription.apiKeys',
    icon: KeyIcon,
    component: ApiKeysPanel,
    needsOrganization: false,
  },
  {
    value: 'webhooks',
    labelKey: 'settings.tabs.webhooks',
    descriptionKey: 'settings.sectionDescription.webhooks',
    icon: BoltIcon,
    component: WebhookDefaultsForm,
    needsOrganization: true,
  },
  {
    value: 'users',
    labelKey: 'settings.tabs.users',
    descriptionKey: 'settings.sectionDescription.users',
    icon: UserGroupIcon,
    component: UsersPanel,
    needsOrganization: false,
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
})
</script>
