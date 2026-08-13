<template>
  <Sheet v-model:open="open">
    <SheetTrigger as-child>
      <Button variant="ghost" size="sm" data-testid="help-trigger" :aria-label="$t('help.open')">
        <QuestionMarkCircleIcon aria-hidden="true" />
        <span>{{ $t('help.label') }}</span>
      </Button>
    </SheetTrigger>

    <SheetContent side="right" class="w-full gap-0 sm:max-w-md" data-testid="help-sheet">
      <SheetHeader>
        <SheetTitle>{{ $t(topic.titleKey) }}</SheetTitle>
        <SheetDescription>{{ $t(topic.summaryKey) }}</SheetDescription>
      </SheetHeader>

      <div class="flex flex-col gap-8 overflow-y-auto px-4 pb-6">
        <section class="flex flex-col gap-3">
          <h3 class="text-sm font-semibold text-foreground">{{ $t('help.stepsTitle') }}</h3>
          <!--
            Numbered because these are an ORDER, not a menu: an operator who
            runs step 3 before step 1 gets a project with no participants and
            no way to tell why. A bulleted list would not say that.
          -->
          <ol class="flex flex-col gap-3" data-testid="help-steps">
            <li v-for="(stepKey, index) in topic.stepKeys" :key="stepKey" class="flex gap-3">
              <span
                aria-hidden="true"
                class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary"
              >
                {{ index + 1 }}
              </span>
              <span class="text-sm leading-6 text-muted-foreground">{{ $t(stepKey) }}</span>
            </li>
          </ol>
        </section>

        <section v-if="topic.termKeys.length > 0" class="flex flex-col gap-3">
          <h3 class="text-sm font-semibold text-foreground">{{ $t('help.glossaryTitle') }}</h3>
          <!--
            A definition list, not a table: these are terms with meanings, and
            `<dl>` is what a screen reader announces as such.
          -->
          <dl class="flex flex-col gap-3" data-testid="help-glossary">
            <div v-for="termKey in topic.termKeys" :key="termKey" class="flex flex-col gap-0.5">
              <dt class="text-sm font-medium text-foreground">{{ $t(`${termKey}.term`) }}</dt>
              <dd class="text-sm leading-6 text-muted-foreground">
                {{ $t(`${termKey}.definition`) }}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </SheetContent>
  </Sheet>
</template>

<script setup lang="ts">
/**
 * Contextual help, one topic per route.
 *
 * Not a documentation site and not a product tour. An operator opening
 * /reports for the first time has two questions — "what is this screen for"
 * and "what do these words mean" — and both are answerable in a panel they can
 * read WITH the screen still in front of them. A modal tour would cover the
 * thing it is describing; a linked wiki would be read once and never again.
 *
 * The topic is chosen from the route, so the button never opens generic help
 * on a specific page. An unrecognised route falls back to the overview rather
 * than rendering an empty panel, which matters because new routes are added
 * more often than this map is updated.
 */
import { computed, ref } from 'vue'
import { QuestionMarkCircleIcon } from '@heroicons/vue/24/outline'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

interface HelpTopic {
  titleKey: string
  summaryKey: string
  stepKeys: string[]
  /** Each key resolves `${key}.term` and `${key}.definition`. */
  termKeys: string[]
}

function topicOf(name: string, steps: number, terms: string[] = []): HelpTopic {
  return {
    titleKey: `help.topics.${name}.title`,
    summaryKey: `help.topics.${name}.summary`,
    stepKeys: Array.from({ length: steps }, (_, index) => `help.topics.${name}.steps.${index}`),
    termKeys: terms.map((term) => `help.glossary.${term}`),
  }
}

// Keyed by the first path segment, so /projects and /projects/42 share a topic.
const TOPICS: Record<string, HelpTopic> = {
  '': topicOf('dashboard', 3, ['project', 'participant']),
  projects: topicOf('projects', 4, ['project', 'assessmentType', 'roleCode', 'frameworkVersion']),
  participants: topicOf('participants', 3, ['participant', 'lifecycle', 'ssoLink']),
  reports: topicOf('reports', 3, ['bars', 'competency', 'reliability']),
  settings: topicOf('settings', 4, ['apiKey', 'ability', 'webhook']),
  'avatar-templates': topicOf('avatarTemplates', 3, ['avatarTemplate']),
}

const route = useRoute()
const open = ref(false)

const topic = computed<HelpTopic>(() => {
  const segment = route.path.split('/')[1] ?? ''
  return TOPICS[segment] ?? TOPICS['']!
})
</script>
