<script setup lang="ts">
/**
 * The one button primitive of the app.
 *
 * Four looks (primary/secondary/ghost/danger), three sizes, an optional lucide
 * icon on either side, and a link form: setting `href` swaps the `<button>` for
 * an `<a>` with the exact same classes so a "button" that navigates still looks
 * like a button.
 *
 * `loading` never resizes the control. The label keeps its grid cell and only
 * loses its opacity while the spinner takes the same cell, so the width is
 * stable *and* the accessible name survives (an sr-only or `display: none`
 * label would make the button announce itself as empty while busy).
 */
import { computed } from 'vue'
import { LoaderCircle } from 'lucide-vue-next'
import type { Component } from 'vue'
import { cx } from '@/lib/utils'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'
type ButtonType = 'button' | 'submit' | 'reset'

const props = withDefaults(
  defineProps<{
    variant?: Variant
    size?: Size
    type?: ButtonType
    loading?: boolean
    disabled?: boolean
    block?: boolean
    iconLeft?: Component
    iconRight?: Component
    /** Accessible name for icon-only buttons, which have no visible text. */
    ariaLabel?: string
    href?: string
  }>(),
  {
    variant: 'primary',
    size: 'md',
    type: 'button',
    loading: false,
    disabled: false,
    block: false,
  },
)

const emit = defineEmits<{ click: [event: MouseEvent] }>()

const isInactive = computed(() => props.disabled || props.loading)
const isAnchor = computed(() => typeof props.href === 'string' && props.href.length > 0)

const variantClasses: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white motion-safe:hover:bg-brand-700 motion-safe:active:bg-brand-700',
  secondary:
    'border border-line bg-surface text-ink motion-safe:hover:bg-surface-muted motion-safe:active:bg-surface-muted',
  ghost:
    'text-ink-muted motion-safe:hover:bg-surface-muted motion-safe:hover:text-ink motion-safe:active:bg-surface-muted',
  danger: 'bg-danger text-white motion-safe:hover:bg-danger/90 motion-safe:active:bg-danger/90',
}

const sizeClasses: Record<Size, string> = {
  sm: 'min-h-11 px-3 text-sm',
  md: 'min-h-11 px-4 text-sm',
  lg: 'min-h-11 px-5 text-base',
}

const iconSizeClasses: Record<Size, string> = {
  sm: 'size-4',
  md: 'size-4',
  lg: 'size-5',
}

const rootClass = computed(() =>
  cx(
    'inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-control font-semibold whitespace-nowrap select-none',
    'motion-safe:transition-colors motion-safe:duration-150 motion-safe:ease-snap',
    'focus-visible:ring-brand-500 focus-visible:ring-2',
    variantClasses[props.variant],
    sizeClasses[props.size],
    props.block && 'w-full',
    isInactive.value && 'cursor-not-allowed opacity-60',
  ),
)

function onClick(event: MouseEvent): void {
  // A disabled `<button>` swallows the click in the browser, but a disabled
  // `<a>` and a programmatically dispatched event do not — guard both.
  if (isInactive.value) {
    event.preventDefault()
    event.stopPropagation()
    return
  }
  emit('click', event)
}
</script>

<template>
  <component
    :is="isAnchor ? 'a' : 'button'"
    :href="isAnchor ? props.href : undefined"
    :rel="isAnchor ? 'noopener' : undefined"
    :type="isAnchor ? undefined : props.type"
    :disabled="isAnchor ? undefined : isInactive"
    :aria-disabled="isAnchor && isInactive ? 'true' : undefined"
    :aria-label="props.ariaLabel"
    :aria-busy="props.loading ? 'true' : undefined"
    :class="rootClass"
    data-testid="base-button"
    @click="onClick"
  >
    <span class="grid place-items-center">
      <span
        :class="
          cx('col-start-1 row-start-1 inline-flex items-center gap-2', props.loading && 'opacity-0')
        "
        data-testid="base-button-label"
      >
        <component
          :is="props.iconLeft"
          v-if="props.iconLeft"
          :class="iconSizeClasses[props.size]"
          aria-hidden="true"
          data-testid="base-button-icon-left"
        />
        <slot />
        <component
          :is="props.iconRight"
          v-if="props.iconRight"
          :class="iconSizeClasses[props.size]"
          aria-hidden="true"
          data-testid="base-button-icon-right"
        />
      </span>
      <LoaderCircle
        v-if="props.loading"
        :class="cx('col-start-1 row-start-1 motion-safe:animate-spin', iconSizeClasses[props.size])"
        aria-hidden="true"
        data-testid="base-button-spinner"
      />
    </span>
  </component>
</template>
