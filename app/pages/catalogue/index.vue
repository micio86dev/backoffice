<template>
  <div class="flex flex-col gap-6">
    <div>
      <h1 class="text-2xl font-semibold text-foreground">{{ $t('catalogue.title') }}</h1>
      <p class="mt-1 max-w-2xl text-sm text-muted-foreground">{{ $t('catalogue.intro') }}</p>
    </div>

    <Alert v-if="loadError" variant="destructive" data-testid="catalogue-error">
      <AlertTitle>{{ $t(resourceErrorKey(loadError, 'title')) }}</AlertTitle>
      <AlertDescription>{{ $t(resourceErrorKey(loadError, 'message')) }}</AlertDescription>
    </Alert>

    <!--
      Revision header (DESIGN.md §8.2.10): state, label, and a Publish action
      that is irreversible — a published revision never accepts another
      write, additive or otherwise — so it sits behind the same
      `ConfirmDialog` gate every other destructive action in this product
      uses.
    -->
    <div
      v-if="revision"
      data-testid="catalogue-revision-header"
      class="flex items-center justify-between gap-4 rounded-lg border border-border p-4"
    >
      <div>
        <p class="text-sm font-medium text-foreground" data-testid="catalogue-revision-state">
          {{
            revision.state === 'draft'
              ? $t('catalogue.revision.draft')
              : $t('catalogue.revision.published')
          }}
        </p>
        <p class="text-muted-foreground text-sm" data-testid="catalogue-revision-label">
          {{ revision.label ?? $t('catalogue.revision.untitled') }}
        </p>
      </div>
      <Button
        v-if="revision.state === 'draft'"
        data-testid="catalogue-publish"
        @click="publishTarget = true"
      >
        {{ $t('catalogue.revision.publish') }}
      </Button>
    </div>
    <p
      v-else-if="!loading && !loadError"
      class="text-muted-foreground text-sm"
      data-testid="catalogue-revision-none"
    >
      {{ $t('catalogue.revision.none') }}
    </p>

    <FormMessage
      v-if="publishError"
      :kind="publishError.kind"
      :text="publishError.text"
      test-id="catalogue-publish-error"
    />

    <!--
      Section rail, not a tab strip (DESIGN.md §8.2.1 / §8.2.10): Competencies,
      Roles, Indicators and Default questions are four distinct authoring
      surfaces with different shapes, not peer views of one dataset — the
      same reasoning that already rules a horizontal strip out for
      `/settings`. Same `Tabs`/`orientation="vertical"` primitive, same
      reka-ui semantics (`role="tab"`/`role="tabpanel"`, roving focus, lazy
      panel mounting).
    -->
    <Tabs v-model="activeSection" orientation="vertical" class="items-start gap-8">
      <TabsList
        class="sticky top-6 w-64 shrink-0 items-stretch gap-1 rounded-none bg-transparent p-0"
      >
        <TabsTrigger
          v-for="section in SECTIONS"
          :key="section.value"
          :value="section.value"
          class="h-auto w-full flex-none items-start justify-start gap-3 whitespace-normal rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-card data-active:bg-primary/10 [&_[data-part=label]]:text-foreground data-active:[&_[data-part=label]]:text-primary data-active:[&_[data-part=label]]:font-semibold"
        >
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
          <CatalogueDefaultQuestionsPanel v-if="section.value === 'defaultQuestions'" />
          <!--
            Competencies/Roles/Indicators: no CRUD surface in this PR —
            design.md's own PR10 file list names only QuestionListEditor,
            the page shell and CatalogueDefaultQuestionsPanel. Rather than
            invent an unrequested read/write surface for three more resource
            types, this section says so honestly. Flagged in the apply
            report as a real DESIGN.md/design.md/tasks.md gap, not silently
            resolved.
          -->
          <p
            v-else
            class="text-muted-foreground text-sm"
            :data-testid="`catalogue-section-placeholder-${section.value}`"
          >
            {{ $t('catalogue.sections.notYetAvailable') }}
          </p>
        </TabsContent>
      </div>
    </Tabs>

    <ConfirmDialog
      :open="publishTarget"
      :title="$t('catalogue.revision.confirmPublishTitle')"
      :description="$t('catalogue.revision.confirmPublishBody')"
      :confirm-label="$t('catalogue.revision.publish')"
      @confirm="onPublishConfirmed"
      @cancel="publishTarget = false"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * `/catalogue` — the platform-superadmin authoring surface over the
 * framework catalogue (framework-catalogue-authoring PR10, DESIGN.md
 * §8.2.10). Standalone, platform-scoped page after `pages/avatar-
 * templates/index.vue`'s shape: no "Act as" dependency, no client scope at
 * all — the catalogue is platform content, never one organization's data.
 *
 * Reachability is fully gated upstream: `SidebarNav.vue`'s nav entry and
 * `middleware/03.abilities.global.ts`'s route guard both key on
 * `catalogue.manage`, and every catalogue endpoint repeats its own
 * `abort_unless(isSuperadmin)` server-side (catalogue-authoring spec). This
 * page therefore runs no ability check of its own — by the time it mounts,
 * only a superadmin could have reached it.
 */
import { defineAsyncComponent, onMounted, ref } from 'vue'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ConfirmDialog from '@/components/molecules/ConfirmDialog.vue'
import FormMessage, { type FormMessageKind } from '@/components/molecules/FormMessage.vue'
import { useCatalogue, type CatalogueRevision } from '@/composables/useCatalogue'
import { resolveResourceErrorState, resourceErrorKey } from '@/utils/error-state'
import { actionErrorMessage } from '@/utils/action-error-message'

const CatalogueDefaultQuestionsPanel = defineAsyncComponent(
  () => import('@/components/organisms/CatalogueDefaultQuestionsPanel.vue')
)

interface CatalogueSection {
  value: 'competencies' | 'roles' | 'indicators' | 'defaultQuestions'
  labelKey: string
  descriptionKey: string
}

const SECTIONS: readonly CatalogueSection[] = [
  {
    value: 'competencies',
    labelKey: 'catalogue.sections.competencies',
    descriptionKey: 'catalogue.sections.competenciesDescription',
  },
  {
    value: 'roles',
    labelKey: 'catalogue.sections.roles',
    descriptionKey: 'catalogue.sections.rolesDescription',
  },
  {
    value: 'indicators',
    labelKey: 'catalogue.sections.indicators',
    descriptionKey: 'catalogue.sections.indicatorsDescription',
  },
  {
    value: 'defaultQuestions',
    labelKey: 'catalogue.sections.defaultQuestions',
    descriptionKey: 'catalogue.sections.defaultQuestionsDescription',
  },
]

definePageMeta({ name: 'catalogue' })

const { t } = useI18n()

useHead({
  title: () => t('catalogue.title'),
  meta: [{ name: 'robots', content: 'noindex, nofollow' }],
})

const { fetchCurrentRevision, publishRevision } = useCatalogue()

const revision = ref<CatalogueRevision | null>(null)
const loadError = ref<ReturnType<typeof resolveResourceErrorState> | null>(null)
/**
 * `true` until the first `fetchCurrentRevision()` settles.
 *
 * Distinct from `revision === null`, which is also the shape of "no
 * revision has ever been opened" — without this, the page shows that
 * confident "nothing here" copy for every visitor during the one tick
 * before the fetch actually resolves (D4: a load in flight must never
 * render as an answer).
 */
const loading = ref(true)
const publishTarget = ref(false)
const publishError = ref<{ kind: FormMessageKind; text: string } | null>(null)

const activeSection = ref<CatalogueSection['value']>('defaultQuestions')

async function load(): Promise<void> {
  try {
    const response = await fetchCurrentRevision()

    revision.value = response.data
    loadError.value = null
  } catch (error) {
    loadError.value = resolveResourceErrorState(error)
  } finally {
    loading.value = false
  }
}

async function onPublishConfirmed(): Promise<void> {
  publishTarget.value = false
  publishError.value = null

  try {
    const response = await publishRevision()

    revision.value = response.data
  } catch (error) {
    // `actionErrorMessage` still tells a genuine 403/404/409 apart from "the
    // sweep refused" (D4) — a 422 falls to the generic `error` state and the
    // catalogue-specific fallback copy below.
    //
    // KNOWN LIMITATION, not silently dropped: the full violations list
    // (`PublishRevision::violations()`, design D3) rides in the 422 body
    // under `violations` as a discriminated tuple keyed by rule name — not
    // the flat `{field: [message]}` shape `actionErrorMessage`/
    // `applyServerFieldErrors` understand — so this banner names ONLY that a
    // publish was refused, not which rule(s) blocked it. Rendering the full
    // per-rule breakdown is future work, out of this PR's assigned scope.
    publishError.value = actionErrorMessage(error, t, 'catalogue.revision.publishError')
  }
}

onMounted(load)
</script>
