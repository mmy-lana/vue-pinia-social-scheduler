<script setup lang="ts">
/**
 * Loading placeholder.
 *
 * Decorative by default: the whole block is `aria-hidden`, because a screen
 * reader gains nothing from "grey rectangle". When the caller passes a `label`
 * the block becomes a polite status region carrying that text instead, so the
 * wait is announced without the shape being described.
 */
import { computed } from 'vue'
import { clamp, cx } from '@/lib/utils'

type Variant = 'text' | 'card' | 'circle'

const props = withDefaults(
  defineProps<{
    variant?: Variant
    /** Text rows to draw. Clamped to 1–20 so a bad value cannot melt the page. */
    lines?: number
    animated?: boolean
    /** Announced text; without it the skeleton is hidden from assistive tech. */
    label?: string
  }>(),
  {
    variant: 'text',
    lines: 1,
    animated: true,
  },
)

/** Guards a non-finite or absurd `lines` value from reaching `v-for`. */
const lineCount = computed(() => clamp(Math.round(props.lines), 1, 20))

const hasLabel = computed(() => typeof props.label === 'string' && props.label.length > 0)

const rootClass = computed(() =>
  cx('flex flex-col gap-2', props.animated && 'motion-safe:animate-pulse'),
)

const textLineClass = 'h-4 rounded-full bg-surface-muted'
const cardLineClass = 'h-4 rounded-full bg-line'
</script>

<template>
  <div
    :role="hasLabel ? 'status' : undefined"
    :aria-hidden="hasLabel ? undefined : 'true'"
    :class="rootClass"
    data-testid="base-skeleton"
  >
    <template v-if="hasLabel">
      <span class="sr-only">{{ props.label }}</span>
    </template>

    <div
      v-if="props.variant === 'text'"
      class="flex w-full flex-col gap-2"
      aria-hidden="true"
      data-testid="base-skeleton-text"
    >
      <span
        v-for="line in lineCount"
        :key="line"
        :class="cx(textLineClass, line === lineCount && lineCount > 1 && 'w-2/3')"
        data-testid="base-skeleton-line"
      />
    </div>

    <div
      v-else-if="props.variant === 'card'"
      class="w-full rounded-card border border-line bg-surface-muted p-5"
      aria-hidden="true"
      data-testid="base-skeleton-card"
    >
      <div class="flex items-center gap-3">
        <span class="size-10 shrink-0 rounded-full bg-line" />
        <span class="flex min-w-0 flex-1 flex-col gap-2">
          <span :class="cx(cardLineClass, 'w-1/3')" />
          <span :class="cx(cardLineClass, 'w-1/2')" />
        </span>
      </div>
      <span :class="cx(cardLineClass, 'mt-4 w-full')" />
    </div>

    <span
      v-else
      class="size-10 rounded-full bg-surface-muted"
      aria-hidden="true"
      data-testid="base-skeleton-circle"
    />
  </div>
</template>
