<script setup lang="ts">
/**
 * One post as it appears on a calendar surface: time, platform dot, one line of
 * text, and a status ring.
 *
 * It is a real button, so tapping it opens the preview — the information is
 * never behind a hover tooltip. Dragging is additive: `useDragReschedule` gets
 * the raw pointer events and decides for itself whether this press became a
 * drag, so a plain tap still works everywhere.
 */
import { computed } from 'vue'
import BaseAvatar from '@/components/ui/BaseAvatar.vue'
import { cx } from '@/lib/utils'
import { formatTime } from '@/lib/datetime'
import { PLATFORMS } from '@/lib/platforms'
import { useAccountsStore } from '@/stores/useAccountsStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import type { Post } from '@/types'

const props = defineProps<{
  post: Post
  /** `week` stacks chips and needs a wider body. */
  variant?: 'cell' | 'column'
}>()

const emit = defineEmits<{
  open: [post: Post]
  'drag-start': [event: PointerEvent, post: Post]
}>()

const accounts = useAccountsStore()
const settings = useSettingsStore()

const account = computed(() => accounts.get(props.post.accountId))
const platform = computed(() => account.value?.platform ?? 'x')
const accent = computed<string>(() => PLATFORMS[platform.value].color)

const time = computed<string>(() =>
  props.post.scheduledAt === null
    ? 'Draft'
    : formatTime(props.post.scheduledAt, settings.tz, settings.is24h),
)

const statusRing: Record<Post['status'], string> = {
  draft: 'border-dashed border-line',
  scheduled: 'border-line',
  publishing: 'border-warn',
  published: 'border-ok',
  failed: 'border-danger',
}

const statusDot: Record<Post['status'], string> = {
  draft: 'bg-ink-muted',
  scheduled: 'bg-info',
  publishing: 'bg-warn',
  published: 'bg-ok',
  failed: 'bg-danger',
}

const snippet = computed<string>(() => {
  const text = props.post.content.replace(/\s+/g, ' ').trim()
  if (text.length === 0) return 'No text'
  return text
})
</script>

<template>
  <button
    type="button"
    :class="
      cx(
        'tap-target flex w-full items-center gap-1.5 rounded-control border bg-surface px-1.5 py-1',
        'text-start text-xs motion-safe:transition-colors motion-safe:duration-150',
        'motion-safe:hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-brand-500/40',
        statusRing[post.status],
        variant === 'column' ? 'min-h-11' : 'h-7',
      )
    "
    :style="{ borderLeft: `3px solid ${accent}` }"
    :aria-label="`${time}, ${PLATFORMS[platform].label}: ${snippet}`"
    data-testid="calendar-chip"
    :data-post-id="post.id"
    :data-status="post.status"
    @click="emit('open', post)"
    @pointerdown="emit('drag-start', $event, post)"
  >
    <BaseAvatar
      v-if="variant === 'column' && account"
      :name="account.displayName"
      :hue="account.avatarHue"
      size="xs"
    />
    <span
      v-else
      class="size-2 shrink-0 rounded-full"
      :style="{ backgroundColor: accent }"
      aria-hidden="true"
    />

    <span class="shrink-0 font-medium text-ink tabular-nums">{{ time }}</span>
    <span class="min-w-0 flex-1 truncate text-ink-muted">{{ snippet }}</span>

    <span
      class="size-1.5 shrink-0 rounded-full"
      :class="statusDot[post.status]"
      aria-hidden="true"
    />
  </button>
</template>