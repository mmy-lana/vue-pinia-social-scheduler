<script lang="ts">
import type { Component } from 'vue'

/** One row of a {@link BaseMenuItem} list. */
export interface BaseMenuItem {
  id: string
  label: string
  icon?: Component
  tone?: 'default' | 'danger'
  /** Skipped by the keyboard and inert on click. */
  disabled?: boolean
  /** Always-visible secondary line — never hover-only information. */
  description?: string
}
</script>

<script setup lang="ts">
/**
 * Dropdown menu primitive.
 *
 * The trigger is a real 44×44 button carrying the accessible name, the panel is
 * a `role="menu"` of `role="menuitem"` buttons with full WAI-ARIA keyboard
 * navigation: Enter/Space/ArrowDown opens on the first enabled item, ArrowUp
 * opens on the last, arrows wrap, Home/End jump, Escape closes and hands focus
 * back to the trigger, Tab dismisses.
 *
 * The panel is teleported and anchored to the trigger's rect so no `overflow`
 * ancestor of the owning card can clip it, and it closes on any outside
 * pointerdown or on a scroll of any ancestor.
 */
import { computed, nextTick, ref, type ComponentPublicInstance, type CSSProperties } from 'vue'
import { onClickOutside, useEventListener } from '@vueuse/core'
import { MoreHorizontal } from 'lucide-vue-next'
import { clamp, cx } from '@/lib/utils'

type MenuAlign = 'start' | 'end'
type MenuWidth = 'auto' | 'w-56' | 'w-64'
type MenuFocus = 'first' | 'last'

const props = withDefaults(
  defineProps<{
    items: BaseMenuItem[]
    /** Accessible name of the trigger. Required — an icon-only button needs one. */
    label: string
    align?: MenuAlign
    width?: MenuWidth
    triggerIcon?: Component
  }>(),
  {
    align: 'end',
    width: 'w-56',
  },
)

/**
 * Icon components are plain functions, and Vue's prop resolution treats a
 * function used as a *prop default* as a factory and calls it. So the fallback
 * is resolved here instead of in `withDefaults`, where it would be invoked
 * with the props object and blow up on the render context.
 */
const triggerIcon = computed<Component>(() => props.triggerIcon ?? MoreHorizontal)

const emit = defineEmits<{
  select: [id: string]
}>()

const open = ref(false)
const trigger = ref<HTMLButtonElement | null>(null)
const panel = ref<HTMLElement | null>(null)
const itemElements = ref<(HTMLButtonElement | null)[]>([])
const activeIndex = ref(-1)

/** Gap between the trigger and the panel, and the minimum distance to a viewport edge. */
const VIEWPORT_GAP = 8
const ITEM_ROW_HEIGHT = 44
const PANEL_PADDING = 8
const MIN_PANEL_WIDTH = 224

const WIDTH_PX: Record<MenuWidth, number> = {
  auto: 0,
  'w-56': 224,
  'w-64': 256,
}

const panelClass = computed(() =>
  cx(
    'z-[60] overflow-y-auto overscroll-contain rounded-control border border-line bg-surface p-1.5 shadow-pop',
    props.width === 'auto' ? 'w-auto min-w-56' : props.width,
  ),
)

const panelStyle = computed<CSSProperties>(() => {
  const rect = trigger.value?.getBoundingClientRect()
  if (!rect) return {}

  const configured = WIDTH_PX[props.width]
  const measuredWidth = panel.value?.offsetWidth ?? 0
  const panelWidth = configured > 0 ? configured : measuredWidth || MIN_PANEL_WIDTH
  const panelHeight =
    panel.value?.offsetHeight || props.items.length * ITEM_ROW_HEIGHT + PANEL_PADDING

  const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_GAP
  const flip = panelHeight > spaceBelow && rect.top > spaceBelow
  const maxLeft = Math.max(VIEWPORT_GAP, window.innerWidth - panelWidth - VIEWPORT_GAP)
  const left = clamp(
    props.align === 'end' ? rect.right - panelWidth : rect.left,
    VIEWPORT_GAP,
    maxLeft,
  )
  const top = flip
    ? Math.max(VIEWPORT_GAP, rect.top - VIEWPORT_GAP - panelHeight)
    : rect.bottom + VIEWPORT_GAP

  return {
    position: 'fixed',
    top: `${top}px`,
    left: `${left}px`,
    maxHeight: `${Math.max(VIEWPORT_GAP, flip ? rect.top - VIEWPORT_GAP : spaceBelow)}px`,
  }
})

const panelTransition = {
  enterFromClass: 'motion-safe:opacity-0 motion-safe:-translate-y-1',
  enterActiveClass: 'motion-safe:transition motion-safe:duration-150 motion-safe:ease-snap',
  leaveToClass: 'motion-safe:opacity-0 motion-safe:-translate-y-1',
  leaveActiveClass: 'motion-safe:transition motion-safe:duration-100 motion-safe:ease-snap',
}

onClickOutside(panel, () => closeMenu(false), { ignore: [trigger] })
useEventListener(window, 'scroll', () => closeMenu(false), { capture: true, passive: true })
useEventListener(window, 'resize', () => closeMenu(false), { passive: true })

function setItemRef(element: Element | ComponentPublicInstance | null, index: number): void {
  itemElements.value[index] = (element as HTMLButtonElement | null) ?? null
}

function enabledIndexes(): number[] {
  const indexes: number[] = []
  props.items.forEach((item, index) => {
    if (!item.disabled) indexes.push(index)
  })
  return indexes
}

function focusItem(index: number): void {
  const element = itemElements.value[index]
  if (!element) return
  activeIndex.value = index
  element.focus()
}

function focusEdge(edge: MenuFocus): void {
  const indexes = enabledIndexes()
  const first = indexes[0]
  const last = indexes[indexes.length - 1]
  const target = edge === 'last' ? last : first
  if (target === undefined) return
  focusItem(target)
}

function moveFocus(delta: 1 | -1): void {
  const indexes = enabledIndexes()
  if (indexes.length === 0) return
  const current = indexes.indexOf(activeIndex.value)
  const anchor = current === -1 ? (delta === 1 ? -1 : 0) : current
  const next = indexes[(anchor + delta + indexes.length) % indexes.length]
  if (next === undefined) return
  focusItem(next)
}

async function openMenu(focus: MenuFocus): Promise<void> {
  if (open.value) return
  open.value = true
  itemElements.value = []
  await nextTick()
  if (!open.value) return
  focusEdge(focus)
}

function closeMenu(restoreFocus: boolean): void {
  if (!open.value) return
  open.value = false
  activeIndex.value = -1
  itemElements.value = []
  if (restoreFocus) trigger.value?.focus()
}

function toggleMenu(): void {
  if (open.value) closeMenu(false)
  else void openMenu('first')
}

function onTriggerKeydown(event: KeyboardEvent): void {
  switch (event.key) {
    // `preventDefault` also suppresses the click a button would synthesise,
    // otherwise Enter would open the menu and immediately close it again.
    case 'Enter':
    case ' ':
      event.preventDefault()
      toggleMenu()
      break
    case 'ArrowDown':
      event.preventDefault()
      if (open.value) focusEdge('first')
      else void openMenu('first')
      break
    case 'ArrowUp':
      event.preventDefault()
      if (open.value) focusEdge('last')
      else void openMenu('last')
      break
    case 'Escape':
      if (!open.value) return
      event.preventDefault()
      event.stopPropagation()
      closeMenu(true)
      break
    default:
      break
  }
}

function onPanelKeydown(event: KeyboardEvent): void {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      moveFocus(1)
      break
    case 'ArrowUp':
      event.preventDefault()
      moveFocus(-1)
      break
    case 'Home':
      event.preventDefault()
      focusEdge('first')
      break
    case 'End':
      event.preventDefault()
      focusEdge('last')
      break
    case 'Escape':
      event.preventDefault()
      event.stopPropagation()
      closeMenu(true)
      break
    case 'Tab':
      // Dismiss but let the browser move focus on naturally.
      closeMenu(false)
      break
    default:
      break
  }
}

function onItemClick(item: BaseMenuItem): void {
  if (item.disabled) return
  emit('select', item.id)
  closeMenu(true)
}

function onItemEnter(item: BaseMenuItem, index: number): void {
  if (item.disabled) return
  activeIndex.value = index
}

function itemClasses(item: BaseMenuItem, index: number): string {
  return cx(
    'tap-target flex w-full items-start gap-3 rounded-control px-3 py-2.5 text-left',
    item.tone === 'danger'
      ? 'text-danger hover:bg-danger/10 focus-visible:bg-danger/10'
      : 'text-ink hover:bg-surface-muted focus-visible:bg-surface-muted',
    item.disabled ? 'cursor-not-allowed text-ink-muted opacity-60' : 'cursor-pointer',
    index === activeIndex.value ? 'bg-surface-muted' : '',
  )
}
</script>

<template>
  <div class="relative inline-flex" data-testid="base-menu">
    <button
      ref="trigger"
      type="button"
      class="tap-target flex size-11 items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted hover:text-ink"
      aria-haspopup="menu"
      :aria-expanded="open"
      :aria-label="label"
      data-testid="base-menu-trigger"
      @click="toggleMenu"
      @keydown="onTriggerKeydown"
    >
      <component :is="triggerIcon" class="size-5" aria-hidden="true" />
    </button>

    <Teleport to="body">
      <Transition v-bind="panelTransition">
        <div
          v-if="open"
          ref="panel"
          role="menu"
          :aria-label="label"
          tabindex="-1"
          :class="panelClass"
          :style="panelStyle"
          data-testid="base-menu-panel"
          @keydown="onPanelKeydown"
        >
          <button
            v-for="(item, index) in items"
            :key="item.id"
            :ref="(element) => setItemRef(element, index)"
            type="button"
            role="menuitem"
            :tabindex="item.disabled ? -1 : 0"
            :aria-disabled="item.disabled ? 'true' : undefined"
            :class="itemClasses(item, index)"
            data-testid="base-menu-item"
            :data-item-id="item.id"
            :data-state="index === activeIndex ? 'active' : undefined"
            @click="onItemClick(item)"
            @mouseenter="onItemEnter(item, index)"
          >
            <component
              :is="item.icon"
              v-if="item.icon"
              class="mt-0.5 size-5 shrink-0"
              aria-hidden="true"
            />
            <span class="min-w-0 flex-1">
              <span class="block truncate text-sm font-medium">{{ item.label }}</span>
              <span v-if="item.description" class="block text-xs text-ink-muted">
                {{ item.description }}
              </span>
            </span>
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
