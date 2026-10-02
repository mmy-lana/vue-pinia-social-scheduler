<script setup lang="ts">
/**
 * One day of the timeline: a sticky header plus the cards scheduled for it.
 *
 * From 768 px up, the header also carries the vertical rail — a dot and a 1 px
 * line that ties the day to its cards. On a phone there is no rail, because it
 * would cost horizontal space without adding anything a header cannot say.
 * Drafts share one bucket that has no rail and no day.
 */
import { computed } from 'vue'
import PostCard from '@/components/posts/PostCard.vue'
import { useBreakpoint } from '@/composables/useBreakpoint'
import { formatDayLong } from '@/lib/datetime'
import { useSettingsStore } from '@/stores/useSettingsStore'
import type { Post, PostActionId } from '@/types'

const props = defineProps<{
  /** `yyyy-MM-dd`, or `drafts` for the untimed bucket. */
  groupKey: string
  label: string
  posts: Post[]
  isDrafts?: boolean
}>()

const emit = defineEmits<{
  action: [postId: string, action: PostActionId]
}>()

const settings = useSettingsStore()
const { isMobile } = useBreakpoint()

const showRail = computed<boolean>(() => !isMobile.value && !props.isDrafts)
const longLabel = computed<string>(() =>
  props.isDrafts ? 'Unscheduled drafts' : formatDayLong(props.groupKey, settings.tz),
)
</script>

<template>
  <section
    class="relative"
    :aria-label="label"
    :data-testid="isDrafts ? 'timeline-drafts-group' : 'timeline-day-group'"
    :data-day-key="isDrafts ? undefined : groupKey"
  >
    <div class="sticky top-0 z-20 -mx-1 bg-canvas/95 px-1 py-2 backdrop-blur">
      <div class="flex items-center gap-3">
        <span
          v-if="showRail"
          class="relative flex w-4 shrink-0 justify-center"
          aria-hidden="true"
        >
          <span class="absolute inset-y-0 w-px bg-line" />
          <span class="relative mt-1.5 size-2.5 rounded-full bg-brand-500 ring-4 ring-canvas" />
        </span>

        <h2
          class="text-sm font-bold tracking-wide text-ink uppercase"
          data-testid="timeline-day-label"
        >
          {{ label }}
        </h2>

        <span class="text-xs text-ink-muted" data-testid="timeline-day-subtitle">
          {{ longLabel }}
        </span>

        <span
          class="ms-auto rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink-muted tabular-nums"
          data-testid="timeline-day-count"
        >
          {{ posts.length }}
        </span>
      </div>
    </div>

    <ul class="flex flex-col gap-4" :class="showRail ? 'ps-7' : ''">
      <li v-for="post in posts" :key="post.id">
        <PostCard
          :post="post"
          @action="(postId, postAction) => emit('action', postId, postAction)"
        />
      </li>
    </ul>
  </section>
</template>