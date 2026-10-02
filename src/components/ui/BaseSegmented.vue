<script setup lang="ts">
/**
 * A single-choice control rendered as a segmented track.
 *
 * It follows the WAI-ARIA radiogroup pattern: exactly one option is in the tab
 * order (roving `tabindex`), arrow keys move *and* select with wrap-around,
 * Home/End jump to the ends, and Space/Enter select the focused option.
 */
import { computed, nextTick, ref, useId } from 'vue'
import type { Component, ComponentPublicInstance } from 'vue'
import { cx } from '@/lib/utils'

interface SegmentedOption {
  value: string
  label: string
  icon?: Component
}

const model = defineModel<string>({ default: '' })

const props = withDefaults(
  defineProps<{
    options: SegmentedOption[]
    /** Required: a radiogroup is meaningless without an accessible name. */
    ariaLabel: string
    size?: 'sm' | 'md'
    /** Stretch the track and every option to the full width of its parent. */
    block?: boolean
  }>(),
  {
    size: 'md',
    block: false,
  },
)

const uid = useId()
const optionRefs = ref<(HTMLButtonElement | null)[]>([])

const groupId = computed(() => `base-segmented-${uid}`)
const optionId = (index: number): string => `${groupId.value}-option-${index}`

/** Where keyboard navigation starts; falls back to the first option. */
const selectedIndex = computed(() => {
  const index = props.options.findIndex((option) => option.value === model.value)
  return index === -1 ? 0 : index
})

const rootClasses = computed(() =>
  cx(
    'inline-flex items-center gap-1 rounded-control border border-line bg-surface-muted p-1',
    props.block ? 'w-full' : 'w-auto',
  ),
)

const optionSizeClasses = computed(() =>
  props.size === 'sm' ? 'px-2.5 text-xs' : 'px-3.5 text-sm',
)

const iconSizeClasses = computed(() => (props.size === 'sm' ? 'size-3.5' : 'size-4'))

function optionClasses(index: number): string {
  const selected = props.options[index]?.value === model.value
  return cx(
    'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-control font-medium',
    'motion-safe:transition-colors motion-safe:transition-shadow ease-snap',
    'focus-visible:ring-2 focus-visible:ring-brand-500/40 focus-visible:ring-offset-2',
    'focus-visible:ring-offset-surface-muted',
    optionSizeClasses.value,
    props.block ? 'flex-1' : '',
    selected ? 'bg-surface text-brand-700 shadow-card' : 'text-ink-muted',
  )
}

function setOptionRef(el: Element | ComponentPublicInstance | null, index: number): void {
  optionRefs.value[index] = el instanceof HTMLButtonElement ? el : null
}

function select(index: number): void {
  const option = props.options[index]
  if (!option) return
  model.value = option.value
}

async function focusOption(index: number): Promise<void> {
  await nextTick()
  optionRefs.value[index]?.focus()
}

function onKeydown(event: KeyboardEvent): void {
  const count = props.options.length
  if (count === 0) return

  const current = selectedIndex.value
  let next: number

  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      next = (current + 1) % count
      break
    case 'ArrowLeft':
    case 'ArrowUp':
      next = (current - 1 + count) % count
      break
    case 'Home':
      next = 0
      break
    case 'End':
      next = count - 1
      break
    case ' ':
    case 'Spacebar':
    case 'Enter':
      next = current
      break
    default:
      return
  }

  // Arrow keys would otherwise scroll the page; Space would scroll too.
  event.preventDefault()
  select(next)
  void focusOption(next)
}
</script>

<template>
  <div
    :id="groupId"
    role="radiogroup"
    :aria-label="ariaLabel"
    :class="rootClasses"
    data-testid="base-segmented"
    @keydown="onKeydown"
  >
    <button
      v-for="(option, index) in options"
      :id="optionId(index)"
      :key="option.value"
      :ref="(el) => setOptionRef(el, index)"
      type="button"
      role="radio"
      data-testid="base-segmented-option"
      :data-value="option.value"
      :class="optionClasses(index)"
      :aria-checked="option.value === model"
      :tabindex="index === selectedIndex ? 0 : -1"
      @click="select(index)"
    >
      <component :is="option.icon" v-if="option.icon" :class="iconSizeClasses" aria-hidden="true" />
      <span class="truncate">{{ option.label }}</span>
    </button>
  </div>
</template>
