<script setup lang="ts">
/**
 * The agenda: every visible day as a list, with its posts underneath.
 *
 * This is the default view on a phone, where a grid is unreadable, and the
 * readable fallback anywhere. Empty days are still rows, each with its own "Add"
 * button — an empty day is a place you can post, not a gap to scroll past.
 */
import BaseEmptyState from '@/components/ui/BaseEmptyState.vue'
import PostCard from '@/components/posts/PostCard.vue'
import { CalendarX } from 'lucide-vue-next'
import { pluralize } from '@/lib/utils'
import type { AgendaGroup, Post, PostActionId } from '@/types'

const props = defineProps<{
  groups: AgendaGroup[]
  /** Highlighted when it came from tapping a day in the compact month grid. */
  selectedKey?: string | null
  /** Show full cards instead of one-line rows. */
  detailed?: boolean
}>()

const emit = defineEmits<{
  add: [dayKey: string]
  openPost: [post: Post]
  action: [postId: string, action: PostActionId]
}>()

const hasPosts = props.groups.some((group) => group.posts.length > 0)
</script>

<template>
  <div class="flex flex-col gap-4" data-testid="calendar-agenda-list">
    <template v-if="hasPosts">
      <section
        v-for="group in groups"
        :key="group.key"
        :data-day-key="group.key"
        :data-selected="selectedKey === group.key ? 'true' : 'false'"
        :aria-label="group.label"
        class="flex flex-col gap-2"
        :class="selectedKey === group.key ? 'rounded-card bg-brand-50/50 p-2 dark:bg-brand-500/5' : ''"
        data-testid="calendar-agenda-group"
      >
        <div class="flex items-center gap-2">
          <h3 class="text-sm font-bold text-ink">{{ group.label }}</h3>
          <span
            v-if="group.posts.length > 0"
            class="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-ink-muted tabular-nums"
          >
            {{ group.posts.length }}
          </span>
          <button
            type="button"
            class="tap-target ms-auto rounded-control px-2 text-xs font-medium text-brand-600 motion-safe:hover:bg-surface-muted dark:text-brand-300"
            :aria-label="`Add a post on ${group.label}`"
            data-testid="calendar-agenda-add"
            @click="emit('add', group.key)"
          >
            Add
          </button>
        </div>

        <ul v-if="group.posts.length > 0" class="flex flex-col gap-3">
          <li v-for="post in group.posts" :key="post.id">
            <PostCard
              v-if="detailed"
              :post="post"
              @action="(postId, action) => emit('action', postId, action)"
            />
            <button
              v-else
              type="button"
              class="card-surface tap-target flex w-full items-center gap-2 px-3 py-2 text-start"
              data-testid="calendar-agenda-row"
              :data-post-id="post.id"
              @click="emit('openPost', post)"
            >
              <span
                class="size-2 shrink-0 rounded-full"
                :data-status="post.status"
                aria-hidden="true"
              />
              <span class="min-w-0 flex-1 truncate text-sm text-ink">
                {{ post.content.replace(/\s+/g, ' ').trim() || 'No text' }}
              </span>
              <span class="shrink-0 text-xs text-ink-muted">Open</span>
            </button>
          </li>
        </ul>

        <p v-else class="text-sm text-ink-muted" data-testid="calendar-agenda-empty">
          No posts · Add
        </p>
      </section>
    </template>

    <BaseEmptyState
      v-else
      :icon="CalendarX"
      title="Nothing scheduled this period"
      :description="`No posts in the visible range. Pick a day below to add one, or move to another period.`"
      data-testid="calendar-agenda-empty-range"
    >
      <template v-if="groups.length > 0" #action>
        <button
          type="button"
          class="tap-target rounded-control px-3 text-sm font-medium text-brand-600 motion-safe:hover:bg-surface-muted dark:text-brand-300"
          data-testid="calendar-agenda-empty-add"
          @click="emit('add', groups[0]?.key ?? '')"
        >
          Add the first post
        </button>
      </template>
    </BaseEmptyState>

    <p class="text-xs text-ink-muted">
      {{ pluralize(groups.length, 'day') }} in view
    </p>
  </div>
</template>