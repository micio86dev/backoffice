<template>
  <!--
    Deliberately non-compliant — a raw `*_at` field interpolated directly
    into the template instead of routed through `FormattedDate`/`formatDate`.
    Exists so `date-render.spec.ts` can prove rule R1 actually detects a
    violation, not just that it passes vacuously against a repo where every
    real template already complies.
  -->
  <span>{{ record.created_at }}</span>
</template>

<script setup lang="ts">
import { reactive } from 'vue'

const record = reactive({ created_at: '2026-03-01T10:00:00Z' })
</script>
