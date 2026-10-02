<script setup lang="ts">
/**
 * The surface primitive: a card on the canvas.
 *
 * Static by default (a plain `<div>` with the house card look). `interactive`
 * promotes it to a real control — it becomes a `<button>` (so it is focusable,
 * activatable with Enter/Space and announced correctly) and gains a hover /
 * active polish plus a focus ring. That state only ever *repeats* information
 * that is already visible, so nothing depends on hover.
 *
 * `as` picks the rendered tag; while `interactive` is set and `as` is left at
 * its default `div`, a `<button>` is rendered instead.
 */
import { computed } from 'vue'
import { cx } from '@/lib/utils'

type Padding = 'none' | 'sm' | 'md' | 'lg'

const props = withDefaults(
  defineProps<{
    as?: string
    padding?: Padding
    interactive?: boolean
  }>(),
  {
    as: 'div',
    padding: 'md',
    interactive: false,
  },
)

const tag = computed(() => (props.interactive && props.as === 'div' ? 'button' : props.as))

const paddingClasses: Record<Padding, string> = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
}

const rootClass = computed(() =>
  cx(
    'card-surface',
    paddingClasses[props.padding],
    props.interactive &&
      cx(
        'w-full cursor-pointer text-left',
        'motion-safe:transition motion-safe:duration-150 motion-safe:ease-snap',
        'motion-safe:hover:border-brand-300 motion-safe:hover:shadow-pop motion-safe:active:scale-[0.995]',
        'focus-visible:ring-brand-500 focus-visible:ring-2',
      ),
  ),
)
</script>

<template>
  <component
    :is="tag"
    :type="props.interactive ? 'button' : undefined"
    :class="rootClass"
    data-testid="base-card"
  >
    <slot />
  </component>
</template>
