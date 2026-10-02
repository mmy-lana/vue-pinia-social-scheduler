<script setup lang="ts">
/**
 * Sticky page header: where you are, what the engine is doing, and the one
 * action that is always one tap away.
 *
 * The engine pill is live rather than decorative — it reads the scheduler's
 * leadership lease, so a second tab says publishing belongs elsewhere instead of
 * looking broken.
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { BookOpen, Plus } from 'lucide-vue-next'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseIconButton from '@/components/ui/BaseIconButton.vue'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { useSchedulerStore } from '@/stores/useSchedulerStore'
import { useUiStore } from '@/stores/useUiStore'
import type { ToastTone } from '@/types'

const TITLES: Record<string, string> = {
  dashboard: 'Timeline',
  calendar: 'Calendar',
  queue: 'Posting queue',
  library: 'Library',
  channels: 'Channels',
  settings: 'Settings',
  'not-found': 'Page not found',
}

const route = useRoute()
const ui = useUiStore()
const scheduler = useSchedulerStore()
const { isMobile } = useBreakpoint()

const title = computed<string>(() => {
  const name = route.name
  return (typeof name === 'string' ? TITLES[name] : undefined) ?? 'Scheduler'
})

const engineState = computed<{ tone: ToastTone; label: string }>(() => {
  if (scheduler.publishingIds.size > 0) return { tone: 'warn', label: 'Publishing…' }
  if (!scheduler.running) return { tone: 'neutral', label: 'Engine paused' }
  if (!scheduler.isLeaderTab) return { tone: 'neutral', label: 'Another tab is publishing' }
  return { tone: 'ok', label: 'Engine running' }
})
</script>

<template>
  <header
    class="z-30 flex shrink-0 items-center gap-3 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur md:px-6"
    data-testid="top-bar"
  >
    <div class="min-w-0 flex-1">
      <h1 class="truncate text-lg font-bold tracking-tight text-ink" data-testid="top-bar-title">
        {{ title }}
      </h1>
      <BaseBadge :tone="engineState.tone" class="mt-1" data-testid="top-bar-engine">
        {{ engineState.label }}
      </BaseBadge>
    </div>

    <BaseIconButton
      label="Guide and manual"
      :icon="BookOpen"
      variant="ghost"
      data-testid="top-bar-guide"
      @click="ui.openGuide()"
    />

    <BaseIconButton
      v-if="isMobile"
      label="New post"
      :icon="Plus"
      variant="primary"
      data-testid="top-bar-new-post"
      @click="ui.openComposer()"
    />
    <BaseButton
      v-else
      variant="primary"
      :icon-left="Plus"
      data-testid="top-bar-new-post"
      @click="ui.openComposer()"
    >
      New post
    </BaseButton>
  </header>
</template>