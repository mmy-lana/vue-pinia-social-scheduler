<script setup lang="ts">
/**
 * The busy indicator: a lucide `LoaderCircle` inside a polite live region.
 *
 * It inherits `currentColor`, so a spinner inside a dark primary button turns
 * white without a second variant. `label` is the text a screen reader hears;
 * it defaults to "Loading", which is the right guess far more often than not.
 */
import { LoaderCircle } from 'lucide-vue-next'
import { cx } from '@/lib/utils'

type Size = 'xs' | 'sm' | 'md' | 'lg'

const props = withDefaults(
  defineProps<{
    size?: Size
    label?: string
  }>(),
  {
    size: 'md',
    label: 'Loading',
  },
)

const sizeClasses: Record<Size, string> = {
  xs: 'size-4',
  sm: 'size-5',
  md: 'size-7',
  lg: 'size-10',
}
</script>

<template>
  <span
    role="status"
    :aria-label="props.label"
    class="inline-flex items-center justify-center"
    :class="sizeClasses[props.size]"
    data-testid="base-spinner"
  >
    <LoaderCircle
      :class="cx('motion-safe:animate-spin', sizeClasses[props.size])"
      aria-hidden="true"
      data-testid="base-spinner-icon"
    />
    <span class="sr-only">{{ props.label }}</span>
  </span>
</template>
