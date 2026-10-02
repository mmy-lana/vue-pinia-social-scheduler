<script setup lang="ts">
/**
 * Full-screen photo viewer.
 *
 * Teleported to `<body>` so no `overflow` ancestor of the card can clip it, and
 * wired to the same primitives the modal dialog uses: `useFocusTrap` keeps Tab
 * inside (and routes Escape to `close`), `useBodyScrollLock` freezes the page
 * behind it. Arrow keys are mandatory; a horizontal swipe is an additive bonus
 * for touch, and the visible close button plus the backdrop are always there,
 * so nothing depends on a gesture.
 *
 * `open` and `index` are both models: the grid owns the state, the viewer moves
 * within it, and the counter ("2 of 4") is announced politely as it changes.
 */
import { computed, ref, useId, watch } from 'vue'
import { useEventListener } from '@vueuse/core'
import { ChevronLeft, ChevronRight, X } from 'lucide-vue-next'
import BaseIconButton from '@/components/ui/BaseIconButton.vue'
import { useBodyScrollLock } from '@/composables/useBodyScrollLock'
import { useFocusTrap } from '@/composables/useFocusTrap'
import type { MediaAsset } from '@/types'

const props = defineProps<{
  assets: MediaAsset[]
}>()

const open = defineModel<boolean>('open', { required: true })
const index = defineModel<number>('index', { required: true })

/** Horizontal travel, in px, that counts as a swipe rather than a nudge. */
const SWIPE_THRESHOLD_PX = 44

const uid = useId()
const titleId = `${uid}-title`
const captionId = `${uid}-caption`

const panel = ref<HTMLElement | null>(null)
const swipeStart = ref<number | null>(null)

const count = computed<number>(() => props.assets.length)
const hasMultiple = computed<boolean>(() => count.value > 1)

/** Clamped so an out-of-range index from the parent can never blank the viewer. */
const position = computed<number>(() => {
  if (count.value === 0) return 0
  return Math.min(Math.max(Math.trunc(index.value), 0), count.value - 1)
})

const current = computed<MediaAsset | null>(() => props.assets[position.value] ?? null)
const counterText = computed<string>(() => `${position.value + 1} of ${count.value}`)
const isActive = computed<boolean>(() => open.value && current.value !== null)

useBodyScrollLock(isActive)

const trap = useFocusTrap({
  active: isActive,
  container: panel,
  autofocus: true,
  onEscape: () => close(),
})

watch(
  isActive,
  (active) => {
    if (active) trap.activate()
    else trap.deactivate()
  },
  { immediate: true },
)

useEventListener(window, 'keydown', (event: KeyboardEvent) => {
  if (!isActive.value) return
  switch (event.key) {
    case 'ArrowRight':
      event.preventDefault()
      move(1)
      break
    case 'ArrowLeft':
      event.preventDefault()
      move(-1)
      break
    case 'Home':
      event.preventDefault()
      index.value = 0
      break
    case 'End':
      event.preventDefault()
      index.value = count.value - 1
      break
    default:
      break
  }
})

function close(): void {
  if (!open.value) return
  open.value = false
}

/** Wraps around at both ends so the keys never dead-end on a long gallery. */
function move(delta: 1 | -1): void {
  const total = count.value
  if (total <= 1) return
  index.value = (position.value + delta + total) % total
}

function onTouchStart(event: TouchEvent): void {
  swipeStart.value = event.changedTouches[0]?.clientX ?? null
}

function onTouchEnd(event: TouchEvent): void {
  const start = swipeStart.value
  swipeStart.value = null
  if (start === null) return
  const delta = (event.changedTouches[0]?.clientX ?? start) - start
  if (Math.abs(delta) < SWIPE_THRESHOLD_PX) return
  move(delta < 0 ? 1 : -1)
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
      <div
        v-if="isActive && current"
        class="fixed inset-0 z-[70] flex flex-col bg-ink/92"
        data-testid="media-lightbox"
      >
        <div
          class="absolute inset-0"
          data-testid="media-lightbox-backdrop"
          @click="close"
        />

        <div class="relative flex min-h-0 flex-1 flex-col">
          <div
            ref="panel"
            role="dialog"
            aria-modal="true"
            :aria-labelledby="titleId"
            :aria-describedby="captionId"
            class="flex min-h-0 flex-1 flex-col"
            tabindex="-1"
            data-testid="media-lightbox-panel"
            @touchstart="onTouchStart"
            @touchend="onTouchEnd"
          >
            <h2 :id="titleId" class="sr-only">Photo viewer</h2>

            <div class="flex items-center justify-between gap-3 p-3">
              <span
                class="rounded-full bg-surface/10 px-2.5 py-1 text-sm text-white"
                aria-live="polite"
                data-testid="media-lightbox-counter"
              >
                {{ counterText }}
              </span>
              <BaseIconButton
                label="Close photo viewer"
                :icon="X"
                class="text-white motion-safe:hover:bg-surface/15 motion-safe:hover:text-white"
                data-testid="media-lightbox-close"
                @click="close"
              />
            </div>

            <div class="relative flex min-h-0 flex-1 items-center justify-center px-3 pb-3">
              <BaseIconButton
                v-if="hasMultiple"
                label="Previous photo"
                :icon="ChevronLeft"
                class="absolute left-3 text-white motion-safe:hover:bg-surface/15 motion-safe:hover:text-white"
                data-testid="media-lightbox-prev"
                @click="move(-1)"
              />
              <img
                :src="current.dataUrl"
                :alt="current.name"
                class="max-h-full max-w-full rounded-control object-contain"
                draggable="false"
                data-testid="media-lightbox-image"
              />
              <BaseIconButton
                v-if="hasMultiple"
                label="Next photo"
                :icon="ChevronRight"
                class="absolute right-3 text-white motion-safe:hover:bg-surface/15 motion-safe:hover:text-white"
                data-testid="media-lightbox-next"
                @click="move(1)"
              />
            </div>

            <p
              :id="captionId"
              class="px-3 pb-3 text-center text-sm text-white/85"
              data-testid="media-lightbox-caption"
            >
              {{ current.name }}
            </p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>