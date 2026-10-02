<script setup lang="ts">
/**
 * Small status pill: soft background, saturated text, optional leading icon.
 *
 * Purely presentational — a `<span>`, never a button, and no `aria-label` of
 * its own: whatever a screen reader has to hear goes into the default slot,
 * where it stays in the accessibility tree.
 */
import type { Component } from 'vue'
import { cx } from '@/lib/utils'

type Tone = 'neutral' | 'info' | 'ok' | 'warn' | 'danger' | 'brand'
type Size = 'sm' | 'md'

const props = withDefaults(
  defineProps<{
    tone?: Tone
    size?: Size
    icon?: Component
  }>(),
  {
    tone: 'neutral',
    size: 'sm',
  },
)

const toneClasses: Record<Tone, string> = {
  neutral: 'bg-surface-muted text-ink-muted',
  info: 'bg-info/10 text-info',
  ok: 'bg-ok/10 text-ok',
  warn: 'bg-warn/15 text-warn',
  danger: 'bg-danger/10 text-danger',
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
}

const sizeClasses: Record<Size, string> = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-sm',
}

const iconSizeClasses: Record<Size, string> = {
  sm: 'size-3',
  md: 'size-4',
}
</script>

<template>
  <span
    class="inline-flex max-w-full items-center gap-1 rounded-full font-medium"
    :class="cx(toneClasses[props.tone], sizeClasses[props.size])"
    data-testid="base-badge"
  >
    <component
      :is="props.icon"
      v-if="props.icon"
      :class="cx('shrink-0', iconSizeClasses[props.size])"
      aria-hidden="true"
      data-testid="base-badge-icon"
    />
    <span class="truncate">
      <slot />
    </span>
  </span>
</template>
