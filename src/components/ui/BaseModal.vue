<script setup lang="ts">
/**
 * Centred dialog primitive.
 *
 * Renders through `Teleport` + `Transition` so it escapes any `overflow` or
 * stacking context of the view that owns it. While open it locks page scroll,
 * traps focus inside the panel and gives focus back to the opener on close.
 *
 * `v-model:open` drives visibility; `closed` fires once the leave transition
 * has finished, which is the safe moment for animation hooks (focus has
 * already returned to the opener by then).
 */
import { computed, ref, useId, useSlots, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { useBodyScrollLock } from '@/composables/useBodyScrollLock'
import { useFocusTrap } from '@/composables/useFocusTrap'
import { cx } from '@/lib/utils'

type ModalSize = 'sm' | 'md' | 'lg' | 'xl'

const props = withDefaults(
  defineProps<{
    /** Heading text. Omit it and use the `header` slot to bring your own markup. */
    title?: string
    /** Secondary line under the heading, wired up through `aria-describedby`. */
    description?: string
    size?: ModalSize
    /** Backdrop click closes the dialog. */
    closeOnBackdrop?: boolean
    /** Escape closes the dialog. */
    closeOnEscape?: boolean
    /** Renders the close button. */
    dismissible?: boolean
    /** Extra classes for the scrollable body region. */
    bodyClass?: string
  }>(),
  {
    size: 'md',
    closeOnBackdrop: true,
    closeOnEscape: true,
    dismissible: true,
  },
)

const emit = defineEmits<{
  /** Emitted after the leave transition finished. */
  closed: []
}>()

const open = defineModel<boolean>('open', { required: true })

const slots = useSlots()
const panel = ref<HTMLElement | null>(null)

/** Instance-scoped ids so several modals can coexist on one page. */
const uid = useId()
const titleId = `${uid}-title`
const descriptionId = `${uid}-description`

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

const panelClass = computed(() => cx('sm:rounded-card', SIZE_CLASSES[props.size]))

const showHeader = computed(
  () =>
    props.dismissible ||
    Boolean(props.title) ||
    Boolean(props.description) ||
    Boolean(slots.header),
)

/** Only reference ids that exist — a dangling `aria-labelledby` is worse than none. */
const labelledBy = computed(() => (props.title ? titleId : undefined))
const describedBy = computed(() => (props.description ? descriptionId : undefined))

useBodyScrollLock(open)

const trap = useFocusTrap({
  active: open,
  container: panel,
  autofocus: true,
  onEscape: () => {
    if (props.closeOnEscape) close()
  },
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
  if (!props.closeOnBackdrop) return
  close()
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-from-class="motion-safe:opacity-0"
      enter-active-class="motion-safe:transition-opacity motion-safe:duration-150 motion-safe:ease-snap"
      leave-to-class="motion-safe:opacity-0"
      leave-active-class="motion-safe:transition-opacity motion-safe:duration-100 motion-safe:ease-snap"
      @after-leave="emit('closed')"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-6"
        data-testid="base-modal"
      >
        <div
          class="absolute inset-0 bg-ink/40"
          data-testid="base-modal-backdrop"
          @click="onBackdropClick"
        />

        <div
          ref="panel"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="labelledBy"
          :aria-describedby="describedBy"
          class="relative flex max-h-[90dvh] w-full flex-col overflow-hidden bg-surface shadow-pop"
          :class="panelClass"
          data-testid="base-modal-panel"
        >
          <div
            v-if="showHeader"
            class="flex shrink-0 items-start gap-4 border-b border-line px-6 py-4"
          >
            <div class="min-w-0 flex-1">
              <slot name="header">
                <h2 v-if="title" :id="titleId" class="text-lg font-semibold text-ink">
                  {{ title }}
                </h2>
                <p v-if="description" :id="descriptionId" class="mt-1 text-sm text-ink-muted">
                  {{ description }}
                </p>
              </slot>
            </div>

            <button
              v-if="dismissible"
              type="button"
              class="tap-target -mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted hover:text-ink"
              aria-label="Close"
              data-testid="base-modal-close"
              @click="close"
            >
              <X class="size-5" aria-hidden="true" />
            </button>
          </div>

          <div
            :class="cx('min-h-0 flex-1 overflow-y-auto px-6 py-4', bodyClass)"
            data-testid="base-modal-body"
          >
            <slot />
          </div>

          <div
            v-if="$slots.footer"
            class="shrink-0 border-t border-line px-6 py-4"
            data-testid="base-modal-footer"
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
