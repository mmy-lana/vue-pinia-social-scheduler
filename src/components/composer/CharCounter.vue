<script setup lang="ts">
/**
 * The character budget readout that sits under the composer.
 *
 * A post can be limited by several channels at once, so the numbers alone are
 * ambiguous: "1,240 of 3,000" says nothing about *why*. The ring carries the
 * pressure (green while there is room, amber once the last tenth is gone, red
 * once the text is already too long) and `limitedBy` names the binding channel
 * whenever the number comes from somewhere other than the default.
 */
import { computed } from 'vue'
import BaseProgressRing from '@/components/ui/BaseProgressRing.vue'
import { platformLabel } from '@/lib/platforms'
import { cx, formatInteger } from '@/lib/utils'
import type { PlatformId } from '@/types'

type Tone = 'ok' | 'warn' | 'danger'

const props = withDefaults(
  defineProps<{
    used: number
    limit: number
    /** The channel that decided `limit`; named so the number is explicable. */
    limitedBy?: PlatformId
    /** Field this budget belongs to; used in the accessible name. */
    name?: string
  }>(),
  {
    name: 'Post content',
  },
)

/**
 * Safe against a zero or negative limit so the readout never divides by zero,
 * and still honest when there is one: a budget of 0 with anything written in it
 * is over budget, not comfortably inside it.
 */
const ratio = computed(() => {
  if (props.limit > 0) return props.used / props.limit
  return props.used > 0 ? Number.POSITIVE_INFINITY : 0
})

const tone = computed<Tone>(() => {
  if (ratio.value >= 1) return 'danger'
  if (ratio.value >= 0.9) return 'warn'
  return 'ok'
})

const remaining = computed(() => props.limit - props.used)

const headline = computed(() => {
  const amount = Math.abs(remaining.value)
  return remaining.value > 0
    ? `${formatInteger(amount)} left`
    : `${formatInteger(amount)} over`
})

const toneTextClass = computed(() =>
  cx(
    tone.value === 'ok' && 'text-ok',
    tone.value === 'warn' && 'text-warn',
    tone.value === 'danger' && 'text-danger',
  ),
)

const limitedByLabel = computed(() =>
  props.limitedBy ? `Limited by ${platformLabel(props.limitedBy)}` : '',
)

const statusLabel = computed(
  () =>
    `${props.name}: ${formatInteger(props.used)} of ${formatInteger(props.limit)} characters used. ${headline.value}.`,
)

const ringLabel = computed(
  () => `${formatInteger(props.used)} of ${formatInteger(props.limit)} characters used`,
)
</script>

<template>
  <div
    role="status"
    :aria-label="statusLabel"
    data-testid="char-counter"
    class="flex items-center gap-2"
  >
    <span
      v-if="limitedByLabel"
      class="text-xs text-ink-muted"
      data-testid="char-counter-limited-by"
    >
      {{ limitedByLabel }}
    </span>

    <span
      class="text-sm font-medium tabular-nums"
      :class="toneTextClass"
      data-testid="char-counter-headline"
    >
      {{ headline }}
    </span>

    <span class="sr-only">{{ ringLabel }}</span>

    <BaseProgressRing
      :value="props.used"
      :max="props.limit"
      :size="32"
      :thickness="3"
      :tone="tone"
      :label="ringLabel"
    />
  </div>
</template>
