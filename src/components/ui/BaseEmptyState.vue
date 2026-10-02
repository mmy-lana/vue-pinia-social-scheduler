<script setup lang="ts">
/**
 * "Nothing here yet" placeholder for lists, timelines and search results.
 *
 * Stateless: the caller passes the icon, the copy and — through the `action`
 * slot — the call to action. When no action slot is supplied no empty action
 * area is rendered, so the block never grows a dangling gap.
 */
import { cx } from '@/lib/utils'
import type { Component, Slot } from 'vue'

withDefaults(
  defineProps<{
    icon?: Component
    title: string
    description?: string
    compact?: boolean
  }>(),
  {
    compact: false,
  },
)

const slots = defineSlots<{
  action?: Slot
}>()
</script>

<template>
  <div
    :class="
      cx('flex flex-col items-center text-center', compact ? 'gap-2 px-4 py-6' : 'gap-3 px-6 py-10')
    "
    data-testid="base-empty-state"
  >
    <span
      v-if="icon"
      :class="
        cx(
          'flex shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700',
          compact ? 'size-10 [&>svg]:size-5' : 'size-14 [&>svg]:size-6',
        )
      "
      aria-hidden="true"
    >
      <component :is="icon" />
    </span>

    <h3
      :class="cx('font-semibold text-balance-pretty text-ink', compact ? 'text-base' : 'text-lg')"
      data-testid="base-empty-state-title"
    >
      {{ title }}
    </h3>

    <p
      v-if="description"
      :class="cx('max-w-sm text-balance-pretty text-ink-muted', compact ? 'text-xs' : 'text-sm')"
      data-testid="base-empty-state-description"
    >
      {{ description }}
    </p>

    <div
      v-if="slots.action"
      :class="cx('flex w-full max-w-sm justify-center', compact ? 'pt-1' : 'pt-2')"
      data-testid="base-empty-state-action"
    >
      <slot name="action" />
    </div>
  </div>
</template>
