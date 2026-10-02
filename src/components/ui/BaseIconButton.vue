<script setup lang="ts">
/**
 * Square, icon-only button.
 *
 * The icon carries no label of its own, so `label` is required and is used
 * twice: as the `aria-label` (the accessible name) and as the `title` (the
 * native tooltip). Sizes are never below the 44×44 touch target, even at `sm`.
 */
import { computed } from 'vue'
import { LoaderCircle } from 'lucide-vue-next'
import type { Component } from 'vue'
import { cx } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const props = withDefaults(
  defineProps<{
    /** Accessible name + tooltip. Required: an unlabelled icon is unusable. */
    label: string
    icon: Component
    variant?: Variant
    size?: Size
    disabled?: boolean
    loading?: boolean
    /** Toggle buttons only: reflected as `aria-pressed`. */
    active?: boolean
  }>(),
  {
    variant: 'ghost',
    size: 'md',
    disabled: false,
    loading: false,
    active: false,
  },
)

const emit = defineEmits<{ click: [event: MouseEvent] }>()

const isInactive = computed(() => props.disabled || props.loading)

const variantClasses: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white motion-safe:hover:bg-brand-700 motion-safe:active:bg-brand-700',
  secondary:
    'border border-line bg-surface text-ink motion-safe:hover:bg-surface-muted motion-safe:active:bg-surface-muted',
  ghost:
    'text-ink-muted motion-safe:hover:bg-surface-muted motion-safe:hover:text-ink motion-safe:active:bg-surface-muted',
  danger: 'bg-danger text-white motion-safe:hover:bg-danger/90 motion-safe:active:bg-danger/90',
}

const sizeClasses: Record<Size, string> = {
  sm: 'min-h-11 min-w-11',
  md: 'min-h-11 min-w-11',
  lg: 'min-h-12 min-w-12',
}

const iconSizeClasses: Record<Size, string> = {
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-6',
}

const rootClass = computed(() =>
  cx(
    'inline-flex shrink-0 items-center justify-center rounded-control',
    'motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-snap',
    'focus-visible:ring-brand-500 focus-visible:ring-2',
    variantClasses[props.variant],
    sizeClasses[props.size],
    props.active && 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
    isInactive.value && 'cursor-not-allowed opacity-60',
  ),
)

function onClick(event: MouseEvent): void {
  if (isInactive.value) {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  emit('click', event)
}
</script>

<template>
  <button
    type="button"
    :aria-label="props.label"
    :title="props.label"
    :aria-pressed="props.active ? 'true' : 'false'"
    :aria-busy="props.loading ? 'true' : undefined"
    :disabled="isInactive"
    :class="rootClass"
    data-testid="base-icon-button"
    @click="onClick"
  >
    <LoaderCircle
      v-if="props.loading"
      :class="cx('motion-safe:animate-spin', iconSizeClasses[props.size])"
      aria-hidden="true"
      data-testid="base-icon-button-spinner"
    />
    <component
      :is="props.icon"
      v-else
      :class="iconSizeClasses[props.size]"
      aria-hidden="true"
      data-testid="base-icon-button-icon"
    />
  </button>
</template>
