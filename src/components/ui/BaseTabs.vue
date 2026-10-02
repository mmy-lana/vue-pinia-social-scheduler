<script setup lang="ts">
/**
 * Horizontally scrollable tablist with roving tabindex.
 *
 * The tab strip never wraps: on a 390px phone it scrolls inside its own
 * container instead of blowing out the page. Selection is automatic — arrow
 * keys, Home and End move *and* select — and the model is the single source of
 * truth, so the owning view can filter its own content.
 */
import { computed, useId, useTemplateRef } from 'vue'
import { cx } from '@/lib/utils'
import type { Component } from 'vue'

interface TabItem {
  id: string
  label: string
  icon?: Component
  count?: number
}

const props = withDefaults(
  defineProps<{
    tabs: TabItem[]
    ariaLabel: string
    stretch?: boolean
  }>(),
  {
    stretch: false,
  },
)

/** `v-model` of the active tab id. */
const selected = defineModel<string>({ required: true })

const tablist = useTemplateRef<HTMLElement>('tablist')

/** Unique per instance, so two tablists on one page never collide. */
const instanceId = useId()

/** Ids only carry the characters that are legal (and matchable) in an id. */
function slug(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]+/g, '-')
}

function tabId(id: string): string {
  return `${instanceId}-tab-${slug(id)}`
}

/** The panel a tab owns; the owning view renders and labels it. */
function panelId(id: string): string {
  return `${instanceId}-panel-${slug(id)}`
}

/** Index of the selected tab, falling back to the first one. */
const activeIndex = computed(() => {
  const index = props.tabs.findIndex((tab) => tab.id === selected.value)
  return index === -1 ? 0 : index
})

function focusTabAt(index: number): void {
  const element = tablist.value?.querySelector<HTMLElement>(`[data-tab-index="${index}"]`)
  if (!element) return
  element.focus()
  element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

/** Wraps at both ends, so ArrowRight on the last tab returns to the first. */
function selectIndex(index: number, moveFocus = true): void {
  const total = props.tabs.length
  if (total === 0) return
  const next = ((index % total) + total) % total
  const tab = props.tabs[next]
  if (!tab) return
  selected.value = tab.id
  if (moveFocus) focusTabAt(next)
}

function onKeydown(event: KeyboardEvent): void {
  const total = props.tabs.length
  if (total === 0) return
  const current = activeIndex.value

  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowDown':
      event.preventDefault()
      selectIndex(current + 1)
      break
    case 'ArrowLeft':
    case 'ArrowUp':
      event.preventDefault()
      selectIndex(current - 1)
      break
    case 'Home':
      event.preventDefault()
      selectIndex(0)
      break
    case 'End':
      event.preventDefault()
      selectIndex(total - 1)
      break
    default:
      break
  }
}

/** Count pill on the muted track (unselected) and on the raised tab. */
const COUNT_CLASS =
  'rounded-full bg-brand-100 px-1.5 text-xs font-semibold tabular-nums text-brand-700'
const SELECTED_COUNT_CLASS =
  'rounded-full bg-surface-muted px-1.5 text-xs font-semibold tabular-nums text-ink-muted'

function tabClass(tab: TabItem): string {
  const isSelected = tab.id === selected.value
  return cx(
    'tap-target flex items-center justify-center gap-2 rounded-control border border-line px-3 text-sm font-medium whitespace-nowrap ease-snap motion-safe:transition-colors motion-safe:duration-150 [&>svg]:size-4 [&>svg]:shrink-0',
    isSelected ? 'bg-surface text-ink shadow-card' : 'text-ink-muted',
    props.stretch ? 'grow basis-0 shrink-0' : 'shrink-0',
  )
}
</script>

<template>
  <div
    ref="tablist"
    role="tablist"
    aria-orientation="horizontal"
    :aria-label="ariaLabel"
    class="scrollbar-none flex w-full max-w-full gap-1 overflow-x-auto rounded-control bg-surface-muted p-1"
    data-testid="base-tabs"
    @keydown="onKeydown"
  >
    <button
      v-for="(tab, index) in tabs"
      :id="tabId(tab.id)"
      :key="tab.id"
      type="button"
      role="tab"
      :aria-selected="tab.id === selected"
      :aria-controls="panelId(tab.id)"
      :tabindex="tab.id === selected ? 0 : -1"
      :class="tabClass(tab)"
      :data-tab-index="index"
      :data-tab-id="tab.id"
      data-testid="base-tab"
      @click="selectIndex(index, false)"
    >
      <template v-if="tab.icon">
        <component :is="tab.icon" />
      </template>
      <span class="truncate">{{ tab.label }}</span>
      <span
        v-if="tab.count !== undefined"
        :class="tab.id === selected ? SELECTED_COUNT_CLASS : COUNT_CLASS"
        data-testid="base-tab-count"
      >
        {{ tab.count }}
      </span>
    </button>
  </div>
</template>
