<script setup lang="ts">
/**
 * Status pill for a post: the single place where a `PostStatus` becomes a tone,
 * an icon and a word.
 *
 * The mapping is deliberately data, not a set of `v-if`s scattered through the
 * card, so the timeline, the preview sheet and the queue all describe a status
 * the same way. `publishing` is the only animated state, so its icon is wrapped
 * in a spinner component (`motion-safe:animate-spin`).
 *
 * A failed post carries its reason: the message rides along in the `title`
 * (mouse users) *and* in sr-only text (screen readers), because a coloured pill
 * alone never says why something broke.
 */
import { computed, defineComponent, h, type Component } from 'vue'
import {
  CalendarClock,
  CircleCheck,
  FileEdit,
  LoaderCircle,
  TriangleAlert,
} from 'lucide-vue-next'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import type { PostFailure, PostStatus } from '@/types'

type Size = 'sm' | 'md'
type Tone = 'neutral' | 'info' | 'ok' | 'warn' | 'danger'

interface StatusMeta {
  tone: Tone
  icon: Component
  label: string
}

/** `publishing` is the only moving state, so its icon is wrapped in a spinner. */
const PublishingIcon = defineComponent({
  name: 'PostStatusPublishingIcon',
  setup: () => () => h(LoaderCircle, { class: 'motion-safe:animate-spin' }),
})

const STATUS_META: Record<PostStatus, StatusMeta> = {
  draft: { tone: 'neutral', icon: FileEdit, label: 'Draft' },
  scheduled: { tone: 'info', icon: CalendarClock, label: 'Scheduled' },
  publishing: { tone: 'warn', icon: PublishingIcon, label: 'Publishing' },
  published: { tone: 'ok', icon: CircleCheck, label: 'Published' },
  failed: { tone: 'danger', icon: TriangleAlert, label: 'Failed' },
}

const props = withDefaults(
  defineProps<{
    status: PostStatus
    size?: Size
    /** Overrides the mapped word (e.g. "Publishing to @brand"). */
    label?: string
    /** When present, the failure reason is exposed on hover and to screen readers. */
    failure?: PostFailure | null
  }>(),
  {
    size: 'sm',
    failure: null,
  },
)

const meta = computed<StatusMeta>(() => STATUS_META[props.status])
const text = computed<string>(() => props.label ?? meta.value.label)
const titleText = computed<string>(() =>
  props.failure ? `${text.value}: ${props.failure.message}` : text.value,
)
</script>

<template>
  <span
    class="inline-flex min-w-0 flex-col"
    :title="titleText"
    :aria-label="titleText"
    data-testid="post-status-badge"
    :data-status="props.status"
  >
    <BaseBadge :tone="meta.tone" :size="props.size" :icon="meta.icon">
      {{ text }}
    </BaseBadge>
    <span v-if="props.failure" class="sr-only" data-testid="post-status-failure">
      {{ props.failure.message }}
    </span>
  </span>
</template>