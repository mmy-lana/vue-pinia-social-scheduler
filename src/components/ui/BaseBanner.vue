<script setup lang="ts">
/**
 * Inline feedback strip: a tone-tinted surface with an icon, a message, an
 * optional text action and — when `dismissible` — a close control.
 *
 * The banner never hides itself. Pressing ✕ emits `dismiss` and the owner
 * decides what happens to the message, which keeps the primitive stateless and
 * leaves room for a caller's "undo" affordance.
 */
import { computed } from 'vue'
import { CircleCheck, Info, OctagonAlert, TriangleAlert, X } from 'lucide-vue-next'
import { cx } from '@/lib/utils'
import type { Component, Slot } from 'vue'

/** The five feedback tones a banner can carry. */
type BannerTone = 'neutral' | 'info' | 'ok' | 'warn' | 'danger'

const props = withDefaults(
  defineProps<{
    tone?: BannerTone
    title?: string
    description?: string
    dismissible?: boolean
    action?: string
  }>(),
  {
    tone: 'info',
    dismissible: false,
  },
)

const emit = defineEmits<{
  dismiss: []
  action: []
}>()

defineSlots<{
  default?: Slot
}>()

/** One glyph per tone; `Info` doubles as the neutral marker. */
const TONE_ICONS: Record<BannerTone, Component> = {
  neutral: Info,
  info: Info,
  ok: CircleCheck,
  warn: TriangleAlert,
  danger: OctagonAlert,
}

/** Soft tinted surface per tone. The strong ink text carries the reading. */
const TONE_SURFACE: Record<BannerTone, string> = {
  neutral: 'bg-surface-muted',
  info: 'bg-info/10',
  ok: 'bg-ok/10',
  warn: 'bg-warn/15',
  danger: 'bg-danger/10',
}

/** Accent for the glyph token; stays legible on both canvases. */
const TONE_ACCENT: Record<BannerTone, string> = {
  neutral: 'text-ink-muted',
  info: 'text-info',
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-danger',
}

const icon = computed(() => TONE_ICONS[props.tone])
const accent = computed(() => TONE_ACCENT[props.tone])

/** Urgent tones interrupt; everything else is announced politely. */
const liveRole = computed(() =>
  props.tone === 'warn' || props.tone === 'danger' ? 'alert' : 'status',
)
</script>

<template>
  <div
    :role="liveRole"
    :class="
      cx(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-line px-3 py-2.5 sm:px-4',
        TONE_SURFACE[tone],
      )
    "
    data-testid="base-banner"
  >
    <span
      :class="
        cx(
          'flex size-7 shrink-0 items-center justify-center rounded-full bg-surface [&>svg]:size-4',
          accent,
        )
      "
      aria-hidden="true"
    >
      <component :is="icon" />
    </span>

    <div class="min-w-0 flex-1">
      <slot>
        <p
          v-if="title"
          class="text-sm font-semibold text-balance-pretty text-ink"
          data-testid="base-banner-title"
        >
          {{ title }}
        </p>
        <p
          v-if="description"
          class="text-sm text-balance-pretty text-ink-muted"
          data-testid="base-banner-description"
        >
          {{ description }}
        </p>
      </slot>
    </div>

    <button
      v-if="action"
      type="button"
      class="tap-target shrink-0 rounded-control border border-line bg-surface px-3 text-sm font-semibold text-brand-600 ease-snap motion-safe:transition-colors motion-safe:duration-150"
      data-testid="base-banner-action"
      @click="emit('action')"
    >
      {{ action }}
    </button>

    <button
      v-if="dismissible"
      type="button"
      aria-label="Dismiss"
      class="tap-target flex shrink-0 items-center justify-center rounded-full text-ink-muted ease-snap motion-safe:transition-colors motion-safe:duration-150"
      data-testid="base-banner-dismiss"
      @click="emit('dismiss')"
    >
      <X class="size-4" />
    </button>
  </div>
</template>
