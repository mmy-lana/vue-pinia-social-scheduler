<script setup lang="ts">
/**
 * Decorative platform glyph.
 *
 * Every mark is hand-drawn on one `0 0 24 24` grid and painted with
 * `currentColor`, so it inherits whatever colour its container sets and there
 * is not a single hardcoded hex in this file. The one data-driven colour is the
 * platform accent from `PLATFORMS[id].color`, applied as an inline style — the
 * same "colour as data, never as decoration" rule the avatar hue follows.
 *
 * The glyph is `aria-hidden`: it is decoration sitting next to the platform
 * name, so the accessible name always comes from the surrounding text.
 */
import { computed } from 'vue'
import { PLATFORMS } from '@/lib/platforms'
import { cx } from '@/lib/utils'
import type { PlatformId } from '@/types'

type Size = 'xs' | 'sm' | 'md' | 'lg'

const props = withDefaults(
  defineProps<{
    platform: PlatformId
    size?: Size
    /** Dims the mark — used while the channel is disconnected. */
    muted?: boolean
  }>(),
  {
    size: 'md',
    muted: false,
  },
)

const sizeClasses: Record<Size, string> = {
  xs: 'size-3.5',
  sm: 'size-4',
  md: 'size-5',
  lg: 'size-7',
}

const rootStyle = computed(() => ({ color: PLATFORMS[props.platform].color }))
</script>

<template>
  <span
    :class="
      cx('inline-flex shrink-0 leading-none', sizeClasses[props.size], props.muted && 'opacity-50')
    "
    :style="rootStyle"
    data-testid="platform-icon"
    :data-platform="props.platform"
    :data-size="props.size"
  >
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
      class="size-full"
      data-testid="platform-icon-glyph"
    >
      <!-- X: two crossing strokes. -->
      <path
        v-if="props.platform === 'x'"
        d="M4.5 3h3.7L12 7.4 15.8 3h3.7l-5.7 6.6 5.7 11.4h-3.7L12 16.6 8.2 21H4.5l5.7-11.4L4.5 3z"
      />

      <!-- LinkedIn: the boxed "in" wordmark. -->
      <g v-else-if="props.platform === 'linkedin'">
        <rect
          x="2.9"
          y="2.9"
          width="18.2"
          height="18.2"
          rx="4.6"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
        />
        <path d="M6.5 10.4h2.2V18H6.5zM7.6 5.6a1.3 1.3 0 1 1 0 2.6 1.3 1.3 0 0 1 0-2.6zM10.3 10.4h2.1v1.05h.05c.3-.55 1-1.15 2.1-1.15 2.25 0 2.6 1.4 2.6 3.3V18h-2.2v-3.8c0-.85-.05-1.9-1.15-1.9-1.15 0-1.35.9-1.35 1.85V18h-2.2v-7.6z" />
      </g>

      <!-- Instagram: camera body, lens and flash dot. -->
      <g v-else-if="props.platform === 'instagram'">
        <rect
          x="3.3"
          y="3.3"
          width="17.4"
          height="17.4"
          rx="5.2"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
        />
        <circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" stroke-width="1.8" />
        <circle cx="16.8" cy="7.2" r="1.15" />
      </g>

      <!-- Threads: the "@" spiral. -->
      <path
        v-else-if="props.platform === 'threads'"
        d="M17.9 12.9c0 2.05-1.35 3.2-3.35 3.2-1.65 0-2.95-1.05-2.95-2.75 0-1.85 1.4-3.15 3.4-3.15 2.5 0 4.45 1.55 4.45 4.35 0 3.95-2.95 6.4-7 6.4-4.8 0-8.25-3.7-8.25-8.5 0-4.75 3.5-8.35 8.6-8.35 3.05 0 5.15 1.3 5.95 3.4"
        fill="none"
        stroke="currentColor"
        stroke-width="1.9"
        stroke-linecap="round"
      />

      <!-- Facebook: the lowercase "f" with its hook and crossbar. -->
      <path
        v-else
        d="M13.8 21v-8.1h2.7l.45-3.15H13.8V7.7c0-.9.25-1.5 1.55-1.5h1.75V3.3c-.3-.05-1.35-.13-2.55-.13-2.5 0-4.2 1.5-4.2 4.25v2.27H7.6V13h2.75V21h3.45z"
      />
    </svg>
  </span>
</template>