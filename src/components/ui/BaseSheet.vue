<script setup lang="ts">
/**
 * Mobile sheet primitive.
 *
 * `side="bottom"` is the rounded-top panel anchored to the bottom of the
 * viewport, `side="full"` the full-screen variant used by the composer. Both
 * share the modal accessibility contract: focus trap, page scroll lock,
 * Escape and backdrop close, focus restored to the opener.
 *
 * Swipe-down-to-close is purely additive: the gesture only lives on the grab
 * handle, the close button is always there, and the body keeps its own scroll
 * container so dragging never fights with reading.
 */
import { computed, ref, useId, useSlots, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { useBodyScrollLock } from '@/composables/useBodyScrollLock'
import { useFocusTrap } from '@/composables/useFocusTrap'
import { cx } from '@/lib/utils'

type SheetSide = 'bottom' | 'full'

/** A flick closes when it passes 25% of the sheet, or 120px, whichever comes first. */
const CLOSE_RATIO = 0.25
const CLOSE_DISTANCE = 120
/** Upward drags are rubber-banded so the sheet never detaches from the bottom. */
const UPWARD_RUBBER_BAND = 0.2

const props = withDefaults(
  defineProps<{
    /** Heading text. Omit it and use the `header` slot for custom markup. */
    title?: string
    side?: SheetSide
    /** Renders the close button and enables the swipe gesture. */
    dismissible?: boolean
  }>(),
  {
    side: 'bottom',
    dismissible: true,
  },
)

const open = defineModel<boolean>('open', { required: true })

const slots = useSlots()
const panel = ref<HTMLElement | null>(null)
const handle = ref<HTMLElement | null>(null)

const uid = useId()
const titleId = `${uid}-title`

const dragOffset = ref(0)
const dragging = ref(false)
let dragPointerId: number | null = null
let dragStartY = 0

const overlayClass = computed(() =>
  props.side === 'full'
    ? 'fixed inset-0 z-[70] flex items-stretch justify-stretch'
    : 'fixed inset-0 z-[70] flex items-end justify-center',
)

const panelClass = computed(() =>
  cx(
    'flex flex-col overflow-hidden bg-surface',
    props.side === 'full'
      ? 'absolute inset-0'
      : 'relative max-h-[85dvh] w-full rounded-t-card shadow-pop',
    dragging.value
      ? 'transition-none'
      : 'motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-snap',
  ),
)

const panelStyle = computed(() => ({ transform: `translateY(${dragOffset.value}px)` }))

const showHeader = computed(
  () => props.dismissible || Boolean(props.title) || Boolean(slots.header),
)

const labelledBy = computed(() => (props.title ? titleId : undefined))

useBodyScrollLock(open)

const trap = useFocusTrap({
  active: open,
  container: panel,
  autofocus: true,
  onEscape: () => close(),
})

watch(
  open,
  (isOpen) => {
    if (isOpen) trap.activate()
    else trap.deactivate()
  },
  { immediate: true },
)

function close(): void {
  if (!open.value) return
  open.value = false
}

function onBackdropClick(): void {
  close()
}

/* ------------------------------------------------------------------ *
 * Swipe gesture — handle only, so scrolling the body is untouched.
 * ------------------------------------------------------------------ */

function onDragStart(event: PointerEvent): void {
  if (!props.dismissible) return
  dragging.value = true
  dragPointerId = event.pointerId
  dragStartY = event.clientY
  dragOffset.value = 0
  handle.value?.setPointerCapture?.(event.pointerId)
}

function onDragMove(event: PointerEvent): void {
  if (!dragging.value || event.pointerId !== dragPointerId) return
  const delta = event.clientY - dragStartY
  dragOffset.value = delta > 0 ? delta : delta * UPWARD_RUBBER_BAND
}

function onDragEnd(event: PointerEvent): void {
  if (!dragging.value || event.pointerId !== dragPointerId) return
  const distance = dragOffset.value
  // happy-dom and pre-layout frames report 0, so fall back to the viewport.
  const height = panel.value?.offsetHeight || window.innerHeight
  const threshold = Math.min(CLOSE_DISTANCE, height * CLOSE_RATIO)
  endDrag(event.pointerId)
  if (distance > 0 && distance >= threshold) close()
  else dragOffset.value = 0
}

function onDragCancel(event: PointerEvent): void {
  if (!dragging.value || event.pointerId !== dragPointerId) return
  endDrag(event.pointerId)
  dragOffset.value = 0
}

function endDrag(pointerId: number): void {
  dragging.value = false
  dragPointerId = null
  if (handle.value?.hasPointerCapture?.(pointerId)) handle.value.releasePointerCapture(pointerId)
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-from-class="motion-safe:opacity-0"
      enter-active-class="motion-safe:transition-opacity motion-safe:duration-150 motion-safe:ease-snap"
      leave-to-class="motion-safe:opacity-0"
      leave-active-class="motion-safe:transition-opacity motion-safe:duration-100 motion-safe:ease-snap"
    >
      <div v-if="open" :class="overlayClass" data-testid="base-sheet">
        <div
          class="absolute inset-0 bg-ink/40"
          data-testid="base-sheet-backdrop"
          @click="onBackdropClick"
        />

        <div
          ref="panel"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="labelledBy"
          :class="panelClass"
          :style="panelStyle"
          data-testid="base-sheet-panel"
        >
          <div
            v-if="side === 'bottom'"
            ref="handle"
            class="flex shrink-0 cursor-grab touch-none justify-center pt-3 pb-2 active:cursor-grabbing"
            data-testid="base-sheet-handle"
            aria-hidden="true"
            @pointerdown="onDragStart"
            @pointermove="onDragMove"
            @pointerup="onDragEnd"
            @pointercancel="onDragCancel"
          >
            <span class="h-1.5 w-10 rounded-full bg-line" />
          </div>

          <div
            v-if="showHeader"
            class="flex shrink-0 items-center gap-3 border-b border-line px-5 py-4"
          >
            <div class="min-w-0 flex-1">
              <slot name="header">
                <h2 v-if="title" :id="titleId" class="text-lg font-semibold text-ink">
                  {{ title }}
                </h2>
              </slot>
            </div>

            <button
              v-if="dismissible"
              type="button"
              class="tap-target -mr-2 flex size-11 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted hover:text-ink"
              aria-label="Close"
              data-testid="base-sheet-close"
              @click="close"
            >
              <X class="size-5" aria-hidden="true" />
            </button>
          </div>

          <div
            class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4"
            data-testid="base-sheet-body"
          >
            <slot />
          </div>

          <div
            v-if="$slots.footer"
            class="shrink-0 border-t border-line px-5 py-4"
            data-testid="base-sheet-footer"
          >
            <div class="pb-safe">
              <slot name="footer" />
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
