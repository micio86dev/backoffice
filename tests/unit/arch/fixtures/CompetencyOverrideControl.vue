<!--
  Deliberately non-compliant fixture for competency-override.spec.ts —
  exists so the guard can prove it actually DETECTS a violation, not just
  that it passes vacuously against a repo where no such control exists.
-->
<template>
  <button type="button" @click="forceSelectCompetency(option)">Select anyway</button>
</template>

<script setup lang="ts">
function forceSelectCompetency(option: { id: number }): void {
  // The exact shape the admin-backoffice spec's "No override control exists"
  // requirement forbids: a bypass that selects an uncovered competency
  // regardless of bars_available.
  void option
}
</script>
