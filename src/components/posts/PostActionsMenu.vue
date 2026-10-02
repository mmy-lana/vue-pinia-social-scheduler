<script setup lang="ts">
/**
 * The kebab menu of secondary post actions.
 *
 * The item list is the project's action matrix, declared as data so the menu, its
 * tests and the card's primary button can never drift apart. `publishing` has no
 * action at all — the post is already on its way — and the menu then renders a
 * disabled spinner in the exact same 44 px box, so the card footer does not
 * jump when a post changes state. `busy` does the same while a handler works.
 *
 * Everything is reachable without hover: a real button, a real label, no
 * hover-only rows.
 */
import { computed, type Component } from 'vue'
import {
  Archive,
  CalendarClock,
  CalendarPlus,
  Copy,
  LoaderCircle,
  RefreshCw,
  Send,
  SquarePen,
  Trash2,
} from 'lucide-vue-next'
import BaseMenu, { type BaseMenuItem } from '@/components/ui/BaseMenu.vue'
import type { Post, PostActionId, PostStatus } from '@/types'

interface ActionDefinition {
  id: PostActionId
  label: string
  icon: Component
  tone?: 'default' | 'danger'
  description?: string
}

const ACTIONS: Record<PostActionId, ActionDefinition> = {
  edit: { id: 'edit', label: 'Edit', icon: SquarePen },
  schedule: { id: 'schedule', label: 'Schedule…', icon: CalendarPlus },
  reschedule: { id: 'reschedule', label: 'Reschedule…', icon: CalendarClock },
  'publish-now': { id: 'publish-now', label: 'Publish now', icon: Send },
  'move-to-drafts': { id: 'move-to-drafts', label: 'Move to drafts', icon: Archive },
  duplicate: { id: 'duplicate', label: 'Duplicate', icon: Copy },
  delete: {
    id: 'delete',
    label: 'Delete',
    icon: Trash2,
    tone: 'danger',
    description: 'Also removes the other channels in this group',
  },
  retry: { id: 'retry', label: 'Retry', icon: RefreshCw, description: 'Re-queues the post now' },
}

/**
 * `PostActionId` has no `queue` member, so "Add to queue" keeps its own menu row
 * (it is a distinct intent — the next free weekly slot) but opens the same
 * scheduler as "Schedule…" and therefore emits `schedule`.
 */
const QUEUE_ITEM_ID = 'queue'

const MENU_ID_TO_ACTION: Record<string, PostActionId> = {
  ...(Object.keys(ACTIONS) as PostActionId[]).reduce<Record<string, PostActionId>>((out, id) => {
    out[id] = id
    return out
  }, {}),
  [QUEUE_ITEM_ID]: 'schedule',
}

/** Menu row ids per status, in the order the matrix lists them. */
const MATRIX: Record<PostStatus, readonly string[]> = {
  draft: ['edit', 'schedule', QUEUE_ITEM_ID, 'duplicate', 'delete'],
  scheduled: ['edit', 'reschedule', 'publish-now', 'move-to-drafts', 'duplicate', 'delete'],
  publishing: [],
  published: ['duplicate', 'delete'],
  failed: ['retry', 'edit', 'reschedule', 'duplicate', 'delete'],
}

const props = withDefaults(
  defineProps<{
    post: Post
    /** Disables every row while the parent is working on this post. */
    busy?: boolean
  }>(),
  {
    busy: false,
  },
)

const emit = defineEmits<{
  action: [postId: string, action: PostActionId]
}>()

const items = computed<BaseMenuItem[]>(() =>
  MATRIX[props.post.status].map((id) => {
    if (id === QUEUE_ITEM_ID) {
      return {
        id,
        label: 'Add to queue',
        icon: CalendarPlus,
        description: 'Next free posting slot',
      }
    }
    return { ...(ACTIONS[id as PostActionId] as ActionDefinition) }
  }),
)

/** Nothing to act on, or the caller is mid-flight: show the inert trigger. */
const locked = computed<boolean>(() => props.busy || items.value.length === 0)
const hint = computed<string>(() =>
  props.post.status === 'publishing' ? 'Post actions (publishing…)' : 'Post actions',
)

function onSelect(id: string): void {
  if (props.busy) return
  const action = MENU_ID_TO_ACTION[id]
  if (action === undefined) return
  emit('action', props.post.id, action)
}
</script>

<template>
  <BaseMenu v-if="!locked" :items="items" label="Post actions" @select="onSelect" />
  <button
    v-else
    type="button"
    disabled
    :aria-label="hint"
    :title="hint"
    class="tap-target flex size-11 cursor-not-allowed items-center justify-center rounded-control text-ink-muted opacity-60"
    data-testid="post-actions-trigger"
    data-locked="true"
  >
    <LoaderCircle
      class="size-5 motion-safe:animate-spin"
      aria-hidden="true"
      data-testid="post-actions-spinner"
    />
  </button>
</template>