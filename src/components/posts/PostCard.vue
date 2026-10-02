<script setup lang="ts">
/**
 * The timeline card: everything about one post on one channel.
 *
 * Anatomy follows the Buffer/Hootsuite pattern — platform accent bar, avatar +
 * platform badge + name + handle + relative time + status, the body with an
 * explicit "Show more", the media grid, then a footer that is always visible:
 * status, metrics for published posts, one primary action and the kebab. The
 * primary button changes with the status so the commonest next step is one tap,
 * but nothing at all is hover-only: the kebab repeats the rest.
 *
 * The 3px left border is inline style because `PLATFORMS[platform].color` is
 * data (it comes with the platform), not a design token. Everything else uses
 * tokens, and every transition is behind `motion-safe:`.
 *
 * `compact` collapses all of it to one row for the queue's upcoming list.
 */
import { computed, ref, watch, type CSSProperties, type Component } from 'vue'
import { CalendarPlus, Copy, RefreshCw, Send, TriangleAlert } from 'lucide-vue-next'
import MediaGrid from '@/components/posts/MediaGrid.vue'
import PostActionsMenu from '@/components/posts/PostActionsMenu.vue'
import PostMetricsRow from '@/components/posts/PostMetricsRow.vue'
import PostStatusBadge from '@/components/posts/PostStatusBadge.vue'
import BaseAvatar from '@/components/ui/BaseAvatar.vue'
import BaseBadge from '@/components/ui/BaseBadge.vue'
import BaseButton from '@/components/ui/BaseButton.vue'
import BaseCard from '@/components/ui/BaseCard.vue'
import { postTimestamp } from '@/composables/usePostGroups'
import { useNow } from '@/composables/useNow'
import { useAccountsStore } from '@/stores/useAccountsStore'
import { PLATFORMS, platformLabel } from '@/lib/platforms'
import { cx } from '@/lib/utils'
import type { PlatformId, Post, PostActionId, PostStatus } from '@/types'

/**
 * Rough body-copy measure of six rendered lines. The toggle appears past it, so
 * a short post never grows a pointless control while a long one is never cut off
 * with no way to read the rest.
 */
const CLAMP_CHARS = 240

interface PrimaryAction {
  action: PostActionId
  label: string
  icon: Component
}

const PRIMARY_ACTIONS: Record<PostStatus, PrimaryAction | null> = {
  draft: { action: 'schedule', label: 'Schedule', icon: CalendarPlus },
  scheduled: { action: 'publish-now', label: 'Publish now', icon: Send },
  publishing: null,
  published: { action: 'duplicate', label: 'Duplicate', icon: Copy },
  failed: { action: 'retry', label: 'Retry', icon: RefreshCw },
}

const props = withDefaults(
  defineProps<{
    post: Post
    /** One-line variant for the queue's upcoming list. */
    compact?: boolean
  }>(),
  {
    compact: false,
  },
)

const emit = defineEmits<{
  action: [postId: string, action: PostActionId]
}>()

const accounts = useAccountsStore()
const { now } = useNow(30_000)

const expanded = ref(false)

/** A new post in a recycled card starts collapsed again. */
watch(
  () => props.post.id,
  () => {
    expanded.value = false
  },
)

const account = computed(() => accounts.get(props.post.accountId))
const platform = computed<PlatformId>(() => account.value?.platform ?? 'x')
const platformMeta = computed(() => PLATFORMS[platform.value])

/** The accent is data, so it is painted inline instead of through a token. */
const accentStyle = computed<CSSProperties>(() => ({
  borderLeftWidth: '3px',
  borderLeftColor: platformMeta.value.color,
}))

const displayName = computed<string>(() => account.value?.displayName ?? 'Deleted channel')
const handle = computed<string>(() =>
  account.value ? `@${account.value.handle}` : '@unknown',
)
const timestamp = computed(() => postTimestamp(props.post, now.value))

const isLongContent = computed<boolean>(() => props.post.content.length > CLAMP_CHARS)
const isClamped = computed<boolean>(() => isLongContent.value && !expanded.value)
const failure = computed(() => props.post.failure)
const metrics = computed(() => props.post.metrics)
const primary = computed<PrimaryAction | null>(() => PRIMARY_ACTIONS[props.post.status])

function runAction(action: PostActionId): void {
  emit('action', props.post.id, action)
}

function onMenuAction(postId: string, action: PostActionId): void {
  emit('action', postId, action)
}
</script>

<template>
  <BaseCard
    as="article"
    padding="none"
    class="overflow-hidden"
    :style="accentStyle"
    data-testid="post-card"
    :data-post-id="props.post.id"
    :data-status="props.post.status"
    :data-platform="platform"
    :data-compact="props.compact ? 'true' : 'false'"
  >
    <header
      :class="
        cx(
          'flex gap-3',
          props.compact ? 'items-center px-4 py-3' : 'items-start px-4 pt-4 pb-0',
        )
      "
      data-testid="post-card-header"
    >
      <BaseAvatar
        :name="displayName"
        :hue="account?.avatarHue"
        size="sm"
        :status="account && !account.connected ? 'offline' : null"
      />

      <div class="min-w-0 flex-1">
        <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p class="min-w-0 truncate text-sm font-semibold text-ink" data-testid="post-author">
            {{ displayName }}
          </p>
          <BaseBadge tone="neutral" data-testid="post-platform-badge">
            <span
              class="size-2 shrink-0 rounded-full"
              :style="{ backgroundColor: platformMeta.color }"
              aria-hidden="true"
            />
            {{ platformLabel(platform) }}
          </BaseBadge>
        </div>

        <p class="mt-0.5 flex items-center gap-2 text-xs text-ink-muted">
          <span class="truncate" data-testid="post-handle">{{ handle }}</span>
          <span aria-hidden="true">·</span>
          <time
            :datetime="timestamp.at"
            class="shrink-0"
            :title="timestamp.label"
            data-testid="post-time"
          >
            {{ timestamp.label }}
          </time>
        </p>
      </div>

      <PostStatusBadge
        class="shrink-0"
        :status="props.post.status"
        :failure="failure"
        :size="props.compact ? 'sm' : 'md'"
      />
    </header>

    <template v-if="!props.compact">
      <div class="px-4 pt-3">
        <p
          :class="cx('text-sm whitespace-pre-line text-ink', isClamped && 'clamp-6')"
          data-testid="post-content"
        >
          {{ props.post.content }}
        </p>
        <button
          v-if="isLongContent"
          type="button"
          class="tap-target -mb-2 mt-1 flex items-center rounded-control px-1 text-sm font-semibold text-brand-600 motion-safe:transition-colors motion-safe:duration-150 motion-safe:hover:text-brand-700 dark:text-brand-300"
          :aria-expanded="expanded"
          data-testid="post-content-toggle"
          @click="expanded = !expanded"
        >
          {{ expanded ? 'Show less' : 'Show more' }}
        </button>
      </div>

      <div v-if="props.post.mediaIds.length > 0" class="px-4 pt-3">
        <MediaGrid :media-ids="props.post.mediaIds" />
      </div>

      <div
        v-if="failure"
        class="mt-3 flex items-start gap-2 border-t border-line bg-danger/5 px-4 py-3"
        role="alert"
        data-testid="post-failure"
      >
        <TriangleAlert class="mt-0.5 size-4 shrink-0 text-danger" aria-hidden="true" />
        <p class="min-w-0 text-sm text-danger">
          {{ failure.message }}
          <span class="block text-xs text-ink-muted">{{ failure.code }}</span>
        </p>
      </div>
    </template>

    <p
      v-else
      class="clamp-1 px-4 pb-1 text-sm text-ink-muted"
      data-testid="post-content"
    >
      {{ props.post.content }}
    </p>

    <footer
      :class="
        cx(
          'flex items-center gap-2 px-4',
          props.compact ? 'pb-3' : 'mt-3 flex-wrap border-t border-line py-3',
        )
      "
      data-testid="post-card-footer"
    >
      <PostStatusBadge v-if="!props.compact" :status="props.post.status" :failure="failure" />
      <PostMetricsRow
        v-if="!props.compact && props.post.status === 'published' && metrics"
        :metrics="metrics"
        compact
      />

      <div class="ms-auto flex items-center gap-1.5">
        <BaseButton
          v-if="primary"
          variant="primary"
          size="sm"
          :icon-left="primary.icon"
          :data-post-action="primary.action"
          data-testid="post-primary-action"
          @click="runAction(primary.action)"
        >
          {{ primary.label }}
        </BaseButton>
        <BaseButton
          v-else
          variant="secondary"
          size="sm"
          loading
          data-testid="post-primary-action"
        >
          Publishing…
        </BaseButton>

        <PostActionsMenu :post="props.post" @action="onMenuAction" />
      </div>
    </footer>
  </BaseCard>
</template>