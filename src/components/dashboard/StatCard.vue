<script setup lang="ts">
/**
 * One dashboard metric tile: label, value, optional caption and delta.
 *
 * The icon sits in a tinted circle whose colour follows the tile's tone, so a
 * row of cards reads as a row of states at a glance without a single hardcoded
 * colour. The delta always carries an up arrow — it is opt-in, and a negative
 * movement should be passed as a caption instead of pretending to be a rise.
 */
import { computed, type Component } from 'vue'
import { ArrowUpRight } from 'lucide-vue-next'
import BaseCard from '@/components/ui/BaseCard.vue'
import { cx } from '@/lib/utils'

type Tone = 'neutral' | 'brand' | 'ok' | 'warn' | 'danger'

const props = withDefaults(
  defineProps<{
    label: string
    value: string | number
    caption?: string
    icon?: Component
    tone?: Tone
    /** Short movement note, e.g. `+3 this week`. */
    delta?: string
    /** Tighter padding and scaled icons for side rails and dense layouts. */
    compact?: boolean
  }>(),
  {
    tone: 'neutral',
    compact: false,
  },
)

const iconToneClasses: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-ink-muted',
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
  ok: 'bg-ok/10 text-ok',
  warn: 'bg-warn/15 text-warn',
  danger: 'bg-danger/10 text-danger',
}

const iconClass = computed(() => cx(iconToneClasses[props.tone]))
</script>

<template>
  <BaseCard
    :padding="props.compact ? 'sm' : 'md'"
    class="flex h-full flex-col justify-between gap-1"
    data-testid="stat-card"
    :data-tone="props.tone"
  >
    <div class="flex items-center justify-between gap-2">
      <p
        class="truncate text-xs font-semibold tracking-wide text-ink-muted uppercase"
        data-testid="stat-card-label"
      >
        {{ props.label }}
      </p>

      <span
        v-if="props.icon"
        :class="
          cx(
            'flex shrink-0 items-center justify-center rounded-full',
            props.compact ? 'size-7' : 'size-9',
            iconClass,
          )
        "
        aria-hidden="true"
        data-testid="stat-card-icon"
      >
        <component :is="props.icon" :class="props.compact ? 'size-3.5' : 'size-4'" />
      </span>
    </div>

    <div :class="props.compact ? 'mt-2.5' : ''">
      <p
        :class="cx('font-bold tracking-tight text-ink', props.compact ? 'text-2xl' : 'text-3xl')"
        data-testid="stat-card-value"
      >
        {{ props.value }}
      </p>

      <p
        v-if="props.delta"
        class="mt-0.5 flex items-center gap-1 text-xs font-medium text-ok"
        data-testid="stat-card-delta"
      >
        <ArrowUpRight class="size-3.5" aria-hidden="true" />
        <span>{{ props.delta }}</span>
      </p>

      <p v-if="props.caption" class="mt-0.5 text-xs text-ink-muted" data-testid="stat-card-caption">
        {{ props.caption }}
      </p>
    </div>
  </BaseCard>
</template>