<script setup lang="ts">
/**
 * The app's single confirmation host. Mount it once (App shell) and every
 * `useConfirm()` promise renders through here.
 */
import { computed, ref, watch } from 'vue'
import { AlertTriangle, CircleCheck, Info, TriangleAlert } from 'lucide-vue-next'
import { useConfirm } from '@/composables/useConfirm'
import { useBodyScrollLock } from '@/composables/useBodyScrollLock'
import { useFocusTrap } from '@/composables/useFocusTrap'
import { cx } from '@/lib/utils'
import type { ToastTone } from '@/types'

const { request, respond } = useConfirm()

const panel = ref<HTMLElement | null>(null)
const open = computed(() => request.value !== null)
const titleId = 'confirm-dialog-title'
const descriptionId = 'confirm-dialog-description'

useBodyScrollLock(open)

const trap = useFocusTrap({
  active: open,
  container: panel,
  autofocus: true,
  onEscape: () => respond(false),
})

watch(open, (isOpen) => {
  if (isOpen) trap.activate()
  else trap.deactivate()
})

const toneClasses: Record<ToastTone, string> = {
  neutral: 'bg-surface-muted text-ink-muted',
  info: 'bg-info/10 text-info',
  ok: 'bg-ok/10 text-ok',
  warn: 'bg-warn/15 text-warn',
  danger: 'bg-danger/10 text-danger',
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300',
}

const toneIcon = computed(() => {
  switch (request.value?.tone) {
    case 'danger':
      return TriangleAlert
    case 'warn':
      return AlertTriangle
    case 'ok':
      return CircleCheck
    case 'info':
      return Info
    default:
      return Info
  }
})

const confirmToneClass = computed(() => {
  switch (request.value?.tone) {
    case 'danger':
      return 'bg-danger text-white hover:bg-danger/90'
    case 'warn':
      return 'bg-warn text-ink hover:bg-warn/90'
    case 'ok':
      return 'bg-ok text-white hover:bg-ok/90'
    default:
      return 'bg-brand-600 text-white hover:bg-brand-700'
  }
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="request"
      class="fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-6"
      data-testid="confirm-dialog"
    >
      <div
        class="absolute inset-0 bg-ink/40 motion-safe:animate-[fade-in_150ms_ease-out]"
        data-testid="confirm-backdrop"
        @click="respond(false)"
      />
      <div
        ref="panel"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :aria-describedby="descriptionId"
        class="relative w-full max-w-md rounded-t-card bg-surface p-6 shadow-pop sm:rounded-card"
      >
        <div class="flex items-start gap-4">
          <span
            class="flex size-10 shrink-0 items-center justify-center rounded-full"
            :class="toneClasses[request.tone]"
          >
            <component :is="toneIcon" class="size-5" aria-hidden="true" />
          </span>
          <div class="min-w-0 flex-1">
            <h2 :id="titleId" class="text-lg font-semibold text-ink">{{ request.title }}</h2>
            <p :id="descriptionId" class="mt-1 text-sm text-ink-muted">{{ request.message }}</p>
          </div>
        </div>

        <div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            v-if="request.tertiaryLabel"
            type="button"
            class="tap-target rounded-control px-4 text-sm font-medium text-brand-600 hover:bg-brand-50 dark:hover:bg-brand-500/15"
            data-testid="confirm-tertiary"
            @click="respond(null)"
          >
            {{ request.tertiaryLabel }}
          </button>
          <button
            type="button"
            class="tap-target rounded-control border border-line px-4 text-sm font-medium text-ink hover:bg-surface-muted"
            data-testid="confirm-cancel"
            @click="respond(false)"
          >
            {{ request.cancelLabel }}
          </button>
          <button
            type="button"
            :class="cx('tap-target rounded-control px-4 text-sm font-semibold', confirmToneClass)"
            data-testid="confirm-accept"
            @click="respond(true)"
          >
            {{ request.confirmLabel }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>
