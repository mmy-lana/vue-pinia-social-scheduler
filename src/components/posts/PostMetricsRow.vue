<script setup lang="ts">
/**
 * The published-post footer numbers: impressions, likes, comments, shares and
 * clicks.
 *
 * Values go through `formatCompactNumber` so a card never wraps on six digits,
 * and every number carries its word — visibly in the tooltip, and in sr-only
 * text in the accessibility tree, because an icon on its own announces nothing.
 * The row summarises all five in one `aria-label`, so a screen reader user gets
 * "12.3K impressions, 4 likes, …" from one stop instead of five fragments.
 *
 * `metrics` is required, but the guard below keeps a nullish value (a restored
 * payload from an older schema, say) from throwing and renders nothing at all
 * rather than a row of `NaN`. A real zero renders as `0`.
 */
import { computed, type Component } from 'vue'
import { Eye, Heart, MessageCircle, MousePointerClick, Share2 } from 'lucide-vue-next'
import { cx, formatCompactNumber } from '@/lib/utils'
import type { PostMetrics } from '@/types'

interface MetricDefinition {
  id: keyof PostMetrics
  label: string
  icon: Component
}

const METRICS: readonly MetricDefinition[] = [
  { id: 'impressions', label: 'impressions', icon: Eye },
  { id: 'likes', label: 'likes', icon: Heart },
  { id: 'comments', label: 'comments', icon: MessageCircle },
  { id: 'shares', label: 'shares', icon: Share2 },
  { id: 'clicks', label: 'clicks', icon: MousePointerClick },
]

const props = withDefaults(
  defineProps<{
    metrics: PostMetrics
    /** Tighter type for dense rows (card footers, preview sheets). */
    compact?: boolean
  }>(),
  {
    compact: false,
  },
)

interface MetricRow extends MetricDefinition {
  value: number
  text: string
  title: string
  /**
   * Carries its own leading space. The value and its word sit in adjacent
   * elements and Vue drops the newline between them, so without this a screen
   * reader announces "12.3Kimpressions" as a single token.
   */
  spoken: string
}

const rows = computed<MetricRow[]>(() => {
  const metrics = props.metrics
  if (!metrics) return []
  return METRICS.map((definition) => {
    const raw = metrics[definition.id]
    const value = Number.isFinite(raw) ? raw : 0
    const text = formatCompactNumber(value)
    return {
      ...definition,
      value,
      text,
      title: `${text} ${definition.label}`,
      spoken: ` ${definition.label}`,
    }
  })
})

/** One string for the whole row: the summary a screen reader announces. */
const summary = computed<string>(() => {
  if (rows.value.length === 0) return ''
  return `Post performance: ${rows.value.map((row) => row.title).join(', ')}`
})
</script>

<template>
  <div
    v-if="rows.length > 0"
    class="flex flex-wrap items-center"
    :class="cx(props.compact ? 'gap-x-3 gap-y-1' : 'gap-x-4 gap-y-1.5')"
    role="group"
    :aria-label="summary"
    data-testid="post-metrics-row"
  >
    <span
      v-for="row in rows"
      :key="row.id"
      class="inline-flex items-center gap-1.5 text-ink-muted"
      :title="row.title"
      data-testid="post-metric"
      :data-metric="row.id"
    >
      <component
        :is="row.icon"
        :class="cx('shrink-0 text-ink-muted', props.compact ? 'size-3.5' : 'size-4')"
        aria-hidden="true"
        data-testid="post-metric-icon"
      />
      <span
        :class="cx('font-medium text-ink tabular-nums', props.compact ? 'text-xs' : 'text-sm')"
        data-testid="post-metric-value"
      >
        {{ row.text }}
      </span>
      <span class="sr-only">{{ row.spoken }}</span>
    </span>
  </div>
</template>