<template>
  <p data-testid="llm-mode-explainer" class="text-sm text-muted-foreground">
    {{ $t('avatar_templates.llm.explainer.managedScope') }}
    {{ $t('avatar_templates.llm.explainer.costUnavailable') }}
  </p>
</template>

<script setup lang="ts">
// LlmModeExplainer (pluggable-conversation-llm PR P8, design D0/D9).
//
// Two facts an operator needs beside the picker, made explicit rather than
// left as a design-doc footnote:
//
//   1. `managed` mode leaves ASR/TTS/turn-taking with the avatar provider —
//      only the reasoning model itself is swapped.
//   2. "Actual cost" cannot appear here, ever, in this mode: the provider
//      calls Google directly on BEAI's behalf, so BEAI never receives a
//      token-usage report to measure. This is not a missing feature; it is
//      what D9's rate card and D10's estimator are FOR — a forecast, never
//      an invoice.
//
// No props: there is exactly one mode today (I2 makes `native_duplex`
// unreachable), so there is nothing yet to branch on.
</script>
