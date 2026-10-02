<script setup lang="ts">
/**
 * The timeline itself: day groups, the seven-day window and its explicit
 * "Show next 7 days" button.
 *
 * The window is a real button rather than an infinite scroll, so a screen
 * reader and a keyboard user always have a predictable stopping point and never
 * trigger a surprise load mid-read. Each of the three empty states names the
 * fix instead of just reporting the absence.
 */
import { computed } from 'vue'
import { Link2, PenLine, Radio } from 'lucide-vue-next'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import TimelineDayGroup from '@/components/timeline/TimelineDayGroup.vue'
import { pluralize } from '@/lib/utils'
import type { EmptyReason, PostGroup } from '@/composables/usePostGroups'
import type { PostActionId, TimelineFilter } from '@/types'

const props = defineProps<{
  groups: PostGroup[]
  totalGroups: number
  showMore: boolean
  totalPosts: number
  emptyReason: EmptyReason
  filter: TimelineFilter
}>()

const emit = defineEmits<{
  action: [postId: string, action: PostActionId]
  showMore: []
  create: []
  connect: []
  clearFilters: []
}>()

const summary = computed<string>(() => {
  const count = props.totalPosts
  const label = pluralize(count, 'post')
  return props.totalGroups > 0
    ? `${count} ${label} across ${pluralize(props.totalGroups, 'day')}`
    : `${count} ${label}`
})

const windowed = computed<string>(() =>
  props.showMore
    ? `Showing the first ${props.groups.length} of ${props.totalGroups} days.`
    : `Showing all ${props.totalGroups} ${pluralize(props.totalGroups, 'day')}.`,
)
</script>

<template>
  <div class="flex flex-col gap-5" data-testid="timeline-list">
    <p class="text-xs text-ink-muted" data-testid="timeline-summary">
      {{ summary }}
      <span class="sr-only">.</span>
      <span aria-live="polite" class="sr-only">{{ windowed }}</span>
    </p>

    <template v-if="groups.length > 0">
      <TimelineDayGroup
        v-for="group in groups"
        :key="group.key"
        :group-key="group.key"
        :label="group.label"
        :posts="group.posts"
        :is-drafts="group.isDrafts"
        @action="(postId, postAction) => emit('action', postId, postAction)"
      />

      <div v-if="showMore" class="flex justify-center pt-1">
        <BaseButton variant="secondary" data-testid="timeline-show-more" @click="emit('showMore')">
          Show next 7 days
        </BaseButton>
      </div>
    </template>

    <BaseEmptyState
      v-else-if="emptyReason === 'no-accounts'"
      :icon="Link2"
      title="Connect your first channel"
      description="Every post needs somewhere to go. Connect a channel to start scheduling."
      data-testid="timeline-empty"
    >
      <template #action>
        <BaseButton variant="primary" data-testid="timeline-empty-connect" @click="emit('connect')">
          Connect channel
        </BaseButton>
      </template>
    </BaseEmptyState>

    <BaseEmptyState
      v-else-if="emptyReason === 'no-posts'"
      :icon="PenLine"
      title="Nothing scheduled yet"
      description="Write a post, choose your channels, and pick when it should go out."
      data-testid="timeline-empty"
    >
      <template #action>
        <BaseButton variant="primary" data-testid="timeline-empty-create" @click="emit('create')">
          Create post
        </BaseButton>
      </template>
    </BaseEmptyState>

    <BaseEmptyState
      v-else-if="emptyReason === 'filtered'"
      :icon="Radio"
      title="No posts match"
      description="Nothing here for this channel and status. Widen the filter to see more."
      data-testid="timeline-empty"
    >
      <template #action>
        <BaseButton
          variant="secondary"
          data-testid="timeline-empty-clear"
          @click="emit('clearFilters')"
        >
          Clear filters
        </BaseButton>
      </template>
    </BaseEmptyState>

    <BaseEmptyState
      v-else
      :icon="Radio"
      title="Nothing here yet"
      description="Posts you schedule will appear grouped by day."
      data-testid="timeline-empty"
    >
      <template #action>
        <BaseButton variant="primary" data-testid="timeline-empty-create" @click="emit('create')">
          Create post
        </BaseButton>
      </template>
    </BaseEmptyState>
  </div>
</template>