<script setup lang="ts">
/**
 * Circular progress, drawn with two SVG circles: a track and a value arc.
 *
 * The raw `value` / `max` pair is normalized into a 0–100 percentage first, so
 * an over-full value (150 of 100) reads as a complete ring instead of drawing
 * past the track or producing `NaN`, and `aria-valuenow` is reported from that
 * clamped percentage — never outside its own `aria-valuemin`/`max` range.
 */
import { computed } from 'vue'
import { clamp, cx } from '@/lib/utils'

type Tone = 'ok' | 'warn' | 'danger' | 'brand' | 'neutral'

const props = withDefaults(
  defineProps<{
    value: number
    max?: number
    /** Rendered edge length in px. */
    size?: number
    thickness?: number
    tone?: Tone
    /** Accessible name of the progressbar. */
    label?: string
  }>(),
  {
    max: 100,
    size: 40,
    thickness: 4,
    tone: 'brand',
    label: 'Progress',
  },
)

const toneClasses: Record<Tone, string> = {
  ok: 'stroke-ok',
  warn: 'stroke-warn',
  danger: 'stroke-danger',
  brand: 'stroke-brand-500',
  neutral: 'stroke-ink-muted',
}

const center = computed(() => props.size / 2)
const radius = computed(() => Math.max(0, (props.size - props.thickness) / 2))
const circumference = computed(() => 2 * Math.PI * radius.value)

const percent = computed(() => {
  const { value, max } = props
  if (!Number.isFinite(value) || !Number.isFinite(max) || max <= 0) return 0
  return clamp((value / max) * 100, 0, 100)
})

const dashOffset = computed(() => circumference.value * (1 - percent.value / 100))
</script>

<template>
  <span
    role="progressbar"
    :aria-label="props.label"
    aria-valuemin="0"
    :aria-valuemax="props.max"
    :aria-valuenow="Math.round(percent)"
    :class="cx('inline-flex shrink-0 items-center justify-center', toneClasses[props.tone])"
    data-testid="base-progress-ring"
  >
    <svg
      :width="props.size"
      :height="props.size"
      :viewBox="`0 0 ${props.size} ${props.size}`"
      fill="none"
      aria-hidden="true"
    >
      <circle
        :cx="center"
        :cy="center"
        :r="radius"
        :stroke-width="props.thickness"
        class="stroke-line"
        data-testid="base-progress-ring-track"
      />
      <circle
        :cx="center"
        :cy="center"
        :r="radius"
        :stroke-width="props.thickness"
        stroke-linecap="round"
        :transform="`rotate(-90 ${center} ${center})`"
        :class="toneClasses[props.tone]"
        :stroke-dasharray="circumference"
        :stroke-dashoffset="dashOffset"
        data-testid="base-progress-ring-value"
      />
    </svg>
  </span>
</template>
