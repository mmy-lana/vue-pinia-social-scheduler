<script setup lang="ts">
/**
 * Account avatar: coloured initials, an optional image and a status dot.
 *
 * The background is an inline `hsl()` because the hue is *data* (it comes from
 * the account record, defaulting to a stable hash of the name) rather than a
 * design token. Everything else uses the token utilities.
 *
 * The whole thing is one `role="img"` node named after the person, so the
 * initials never have to spell it out again — they are hidden whenever an image
 * covers them, and the image is decorative on top of the same labelled node.
 */
import { computed, ref, watch } from 'vue'
import { clamp, cx, hueFromString, initialsOf } from '@/lib/utils'

type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl'
type Status = 'online' | 'offline' | 'error' | null

const props = withDefaults(
  defineProps<{
    name: string
    /** 0–359. Derived from the name when omitted. */
    hue?: number
    size?: Size
    src?: string
    status?: Status
  }>(),
  {
    size: 'md',
  },
)

const imageFailed = ref(false)

// A new URL deserves a fresh attempt even if the previous one failed.
watch(
  () => props.src,
  () => {
    imageFailed.value = false
  },
)

const resolvedHue = computed(() =>
  clamp(Math.round(props.hue ?? hueFromString(props.name)), 0, 359),
)

const avatarStyle = computed(() => ({
  backgroundColor: `hsl(${resolvedHue.value} 70% 45%)`,
}))

const initials = computed(() => initialsOf(props.name))
const showImage = computed(() => Boolean(props.src) && !imageFailed.value)

const sizeClasses: Record<Size, string> = {
  xs: 'size-6 text-xs',
  sm: 'size-8 text-sm',
  md: 'size-10 text-base',
  lg: 'size-12 text-lg',
  xl: 'size-14 text-xl',
}

const statusSizeClasses: Record<Size, string> = {
  xs: 'size-2',
  sm: 'size-2',
  md: 'size-2.5',
  lg: 'size-3',
  xl: 'size-3',
}

const statusClasses: Record<Exclude<Status, null>, string> = {
  online: 'bg-ok',
  offline: 'bg-ink-muted',
  error: 'bg-danger',
}

const statusLabels: Record<Exclude<Status, null>, string> = {
  online: 'Online',
  offline: 'Offline',
  error: 'Connection error',
}

const statusLabel = computed(() => (props.status ? statusLabels[props.status] : ''))

function onImageError(): void {
  imageFailed.value = true
}
</script>

<template>
  <span
    class="relative inline-flex shrink-0"
    role="img"
    :aria-label="props.name"
    data-testid="base-avatar"
  >
    <span
      :class="
        cx(
          'inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-semibold text-white',
          sizeClasses[props.size],
        )
      "
      :style="avatarStyle"
      data-testid="base-avatar-disc"
    >
      <span
        :aria-hidden="showImage ? 'true' : undefined"
        class="leading-none select-none"
        data-testid="base-avatar-initials"
      >
        {{ initials }}
      </span>
      <img
        v-if="showImage"
        :src="props.src"
        alt=""
        class="size-full object-cover"
        data-testid="base-avatar-image"
        @error="onImageError"
      />
    </span>
    <span
      v-if="props.status"
      :title="statusLabel"
      :class="
        cx(
          'absolute -right-0.5 -bottom-0.5 rounded-full ring-2 ring-surface',
          statusSizeClasses[props.size],
          statusClasses[props.status],
        )
      "
      data-testid="base-avatar-status"
    >
      <span class="sr-only">{{ statusLabel }}</span>
    </span>
  </span>
</template>
