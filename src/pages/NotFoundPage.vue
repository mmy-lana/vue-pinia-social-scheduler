<script setup lang="ts">
/**
 * The catch-all route.
 *
 * It names what was not found and offers the two places worth going next,
 * rather than a dead end.
 */
import { RouterLink, useRoute } from 'vue-router'
import { Compass } from 'lucide-vue-next'
import BaseCard from '@/components/ui/BaseCard.vue'

const route = useRoute()
</script>

<template>
  <div class="mx-auto flex w-full max-w-xl flex-col items-center px-4 py-16">
    <BaseCard padding="lg" class="w-full">
      <div class="flex flex-col items-center gap-3 text-center">
        <Compass class="size-10 text-ink-muted" aria-hidden="true" />
        <h2 class="text-lg font-bold text-ink">That page does not exist</h2>
        <p class="text-sm text-ink-muted">
          <span v-if="route.path">Nothing is routed at </span>
          <code class="rounded-control bg-surface-muted px-1.5 py-0.5 font-mono text-xs">
            {{ route.path }}
          </code>
          .
        </p>

        <div class="mt-2 flex flex-wrap justify-center gap-2">
          <RouterLink
            to="/dashboard"
            class="tap-target rounded-control bg-brand-600 px-4 py-2 text-sm font-semibold text-white motion-safe:hover:bg-brand-700"
            data-testid="not-found-timeline"
          >
            Go to the timeline
          </RouterLink>
          <RouterLink
            to="/calendar"
            class="tap-target rounded-control border border-line bg-surface px-4 py-2 text-sm font-medium text-ink motion-safe:hover:bg-surface-muted"
            data-testid="not-found-calendar"
          >
            Open the calendar
          </RouterLink>
        </div>
      </div>
    </BaseCard>
  </div>
</template>