<script setup lang="ts">
/**
 * The next posts this channel will publish from its queue.
 *
 * Only posts whose source is `queue` are listed, because these are the ones the
 * weekly pattern claimed automatically — seeing them is how a user checks that
 * the pattern produced what they expected. Each row carries the same actions as
 * a timeline card, so rescheduling one does not need a different vocabulary.
 */
import { computed } from 'vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import PostCard from '@/components/posts/PostCard.vue'
import { ListOrdered } from 'lucide-vue-next'
import { pluralize } from '@/lib/utils'
import type { Post, PostActionId } from '@/types'

const props = withDefaults(
  defineProps<{
    posts: Post[]
    limit?: number
  }>(),
  {
    limit: 10,
  },
)

const emit = defineEmits<{
  action: [postId: string, action: PostActionId]
}>()

const queued = computed<Post[]>(() =>
  props.posts
    .filter((post) => post.source === 'queue')
    .sort((a, b) => (a.scheduledAt ?? '').localeCompare(b.scheduledAt ?? '')),
)

const visible = computed<Post[]>(() => queued.value.slice(0, props.limit))
const hidden = computed<number>(() => queued.value.length - visible.value.length)
</script>

<template>
  <BaseCard padding="sm" data-testid="upcoming-queue-list">
    <h2 class="mb-2 text-sm font-semibold text-ink" data-testid="upcoming-queue-title">
      Next {{ pluralize(visible.length, 'queued post') }}
    </h2>

    <ul v-if="visible.length > 0" class="flex flex-col gap-3">
      <li v-for="post in visible" :key="post.id">
        <PostCard
          :post="post"
          compact
          @action="(postId, action) => emit('action', postId, action)"
        />
      </li>
    </ul>

    <BaseEmptyState
      v-else
      compact
      :icon="ListOrdered"
      title="Nothing queued"
      description="Posts you add with “Add to queue” will appear here, in order."
      data-testid="upcoming-queue-empty"
    />

    <p v-if="hidden > 0" class="mt-2 text-xs text-ink-muted" data-testid="upcoming-queue-hidden">
      {{ pluralize(hidden, 'more post') }} further out.
    </p>
  </BaseCard>
</template>