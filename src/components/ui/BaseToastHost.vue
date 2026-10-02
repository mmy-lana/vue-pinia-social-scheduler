<script setup lang="ts">
/**
 * Toast host. Reads the UI store and renders the stack: bottom-center on
 * phones, bottom-right from tablet up. Toasts self-dismiss on their own timer
 * and can carry one action (Undo), which always stays reachable — a hover-only
 * action would be unusable on touch.
 */
import { onBeforeUnmount, watch } from 'vue'
import { CircleCheck, CircleX, Info, TriangleAlert, Undo2, X } from 'lucide-vue-next'
import { useUiStore } from '@/stores/useUiStore'
import { cx } from '@/lib/utils'
import type { Toast, ToastTone } from '@/types'

const ui = useUiStore()

const timers = new Map<string, ReturnType<typeof setTimeout>>()

function clearTimer(id: string): void {
  const timer = timers.get(id)
  if (timer !== undefined) {
    clearTimeout(timer)
    timers.delete(id)
  }
}

function arm(toast: Toast): void {
  clearTimer(toast.id)
  if (toast.durationMs <= 0) return
  timers.set(
    toast.id,
    setTimeout(() => {
      timers.delete(toast.id)
      ui.dismissToast(toast.id)
    }, toast.durationMs),
  )
}

watch(
  () => ui.toasts.map((toast) => toast.id).join(','),
  () => {
    const live = new Set(ui.toasts.map((toast) => toast.id))
    for (const id of [...timers.keys()]) {
      if (!live.has(id)) clearTimer(id)
    }
    for (const toast of ui.toasts) {
      if (!timers.has(toast.id)) arm(toast)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  for (const timer of timers.values()) clearTimeout(timer)
  timers.clear()
})

const toneClasses: Record<ToastTone, string> = {
  neutral: 'border-line bg-surface text-ink',
  info: 'border-info/30 bg-surface text-ink',
  ok: 'border-ok/30 bg-surface text-ink',
  warn: 'border-warn/40 bg-surface text-ink',
  danger: 'border-danger/40 bg-surface text-ink',
  brand: 'border-brand-500/30 bg-surface text-ink',
}

const iconFor = (tone: ToastTone) => {
  switch (tone) {
    case 'ok':
      return CircleCheck
    case 'danger':
      return CircleX
    case 'warn':
      return TriangleAlert
    default:
      return Info
  }
}

const iconClass: Record<ToastTone, string> = {
  neutral: 'text-ink-muted',
  info: 'text-info',
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
  brand: 'text-brand-600',
}
</script>

<template>
  <div
    class="pointer-events-none fixed inset-x-0 bottom-0 z-[80] flex flex-col items-center gap-2 px-4 pb-4 md:items-end md:px-6 md:pb-6"
    data-testid="toast-host"
    role="region"
    aria-label="Notifications"
  >
    <TransitionGroup
      enter-active-class="motion-safe:transition motion-safe:duration-200"
      enter-from-class="opacity-0 translate-y-2"
      leave-active-class="motion-safe:transition motion-safe:duration-150"
      leave-to-class="opacity-0"
    >
      <div
        v-for="toast in ui.toasts"
        :key="toast.id"
        :class="
          cx(
            'pointer-events-auto flex w-full max-w-md items-start gap-3 rounded-control border px-4 py-3 shadow-pop',
            toneClasses[toast.tone],
          )
        "
        :role="toast.tone === 'danger' ? 'alert' : 'status'"
        :aria-live="toast.tone === 'danger' ? 'assertive' : 'polite'"
        data-testid="toast"
      >
        <component
          :is="iconFor(toast.tone)"
          :class="cx('mt-0.5 size-5 shrink-0', iconClass[toast.tone])"
          aria-hidden="true"
        />
        <p class="min-w-0 flex-1 text-sm" data-testid="toast-message">{{ toast.message }}</p>

        <button
          v-if="toast.action"
          type="button"
          class="tap-target -my-1 inline-flex shrink-0 items-center gap-1 rounded-control px-2 text-sm font-semibold text-brand-600 motion-safe:hover:bg-brand-50 dark:motion-safe:hover:bg-brand-500/15"
          data-testid="toast-action"
          @click="ui.runToastAction(toast.id)"
        >
          <Undo2 class="size-4" aria-hidden="true" />
          {{ toast.action.label }}
        </button>

        <button
          type="button"
          class="tap-target -my-1 -mr-2 shrink-0 rounded-full p-2 text-ink-muted motion-safe:hover:bg-surface-muted"
          aria-label="Dismiss notification"
          data-testid="toast-dismiss"
          @click="ui.dismissToast(toast.id)"
        >
          <X class="size-4" aria-hidden="true" />
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>